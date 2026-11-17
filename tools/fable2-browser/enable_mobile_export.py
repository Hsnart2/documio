#!/usr/bin/env python3
"""Adds an optional automatic mobile GLB export to the patched Fable2 Asset Browser.
Apply AFTER the existing Fable2AssetBrowser selection/categories patch.
Does not include or alter game assets. Original GLB is always retained.
"""
from pathlib import Path
import sys

OPTIMIZER = r'''// gltfpack is a separate MIT-licensed executable distributed with the app.
// An optimized copy is generated; the original export always stays unchanged.
static void try_export_mobile_glb(const std::filesystem::path& source_path) {
#ifdef _WIN32
    if (!S.mdl_export_mobile_optimized) return;
    wchar_t exe_path[32768] = {};
    DWORD used = GetModuleFileNameW(nullptr, exe_path, DWORD(sizeof(exe_path) / sizeof(exe_path[0])));
    if (!used || used >= DWORD(sizeof(exe_path) / sizeof(exe_path[0]))) {
        OutputLog::warn("GLB mobile: impossible individuare la cartella del programma.");
        return;
    }
    const std::filesystem::path tool = std::filesystem::path(exe_path).parent_path() / L"gltfpack.exe";
    std::error_code ec;
    if (!std::filesystem::is_regular_file(tool, ec)) {
        static bool shown = false;
        if (!shown) {
            OutputLog::warn("GLB mobile: gltfpack.exe non trovato accanto al programma. "
                            "GLB originale esportato normalmente.");
            shown = true;
        }
        return;
    }
    std::filesystem::path optimized = source_path.parent_path() /
        (source_path.stem().wstring() + L"_mobile.glb");
    if (optimized == source_path) return;
    // Preserve names/materials/metadata, do not aggressively simplify geometry.
    // -cc needs EXT_meshopt_compression; -tw needs EXT_texture_webp.
    std::wstring command = L"\"" + tool.wstring() + L"\" -i \"" +
        source_path.wstring() + L"\" -o \"" + optimized.wstring() +
        L"\" -cc -tw -kn -km -ke";
    STARTUPINFOW startup = {};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION proc = {};
    if (!CreateProcessW(tool.c_str(), command.data(), nullptr, nullptr,
                        FALSE, CREATE_NO_WINDOW, nullptr, nullptr,
                        &startup, &proc)) {
        OutputLog::warn("GLB mobile: non riesco ad avviare gltfpack.exe.");
        return;
    }
    const DWORD waited = WaitForSingleObject(proc.hProcess, 15 * 60 * 1000);
    DWORD code = 1;
    if (waited == WAIT_OBJECT_0) {
        GetExitCodeProcess(proc.hProcess, &code);
    } else {
        TerminateProcess(proc.hProcess, 1);
        WaitForSingleObject(proc.hProcess, 10000);
        OutputLog::warn("GLB mobile: ottimizzazione interrotta o troppo lunga.");
    }
    CloseHandle(proc.hThread);
    CloseHandle(proc.hProcess);

    auto remove_bad = [&]() {
        std::error_code ignore;
        std::filesystem::remove(optimized, ignore);
    };
    if (code != 0 || waited != WAIT_OBJECT_0) {
        remove_bad();
        OutputLog::warn("GLB mobile: ottimizzazione non riuscita; originale conservato.");
        return;
    }
    std::ifstream in(optimized, std::ios::binary);
    char header[4] = {};
    if (!in.read(header, 4) || std::memcmp(header, "glTF", 4) != 0) {
        in.close();
        remove_bad();
        OutputLog::warn("GLB mobile: file prodotto non valido; originale conservato.");
        return;
    }
    in.close();
    const auto original_bytes = std::filesystem::file_size(source_path, ec);
    if (ec || original_bytes == 0) return;
    const auto optimized_bytes = std::filesystem::file_size(optimized, ec);
    if (ec || optimized_bytes == 0) {
        remove_bad();
        return;
    }
    if (optimized_bytes >= original_bytes) {
        remove_bad();
        OutputLog::info("GLB mobile: copia ottimizzata non piu' piccola, "
                        "mantenuto solo il GLB originale.");
        return;
    }
    const auto saved = static_cast<int>(
        (1.0 - double(optimized_bytes) / double(original_bytes)) * 100.0 + 0.5);
    OutputLog::success("GLB mobile: " + source_path.filename().string() +
        " -> " + optimized.filename().string() + " (" +
        std::to_string(saved) + "% piu' leggero; originale preservato).");
#else
    (void)source_path;
#endif
}
'''

def replace_one(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Contenuto atteso non trovato: {label}")
    return text.replace(old, new, 1)

def edit(root, rel, callback):
    path = root / rel
    existing = path.read_text(encoding='utf-8')
    changed = callback(existing)
    if changed != existing:
        path.write_text(changed, encoding='utf-8', newline='\n')
        print("Modificato:", rel)

def main(root):
    root = Path(root).resolve()
    if not (root / "source/CMakeLists.txt").exists():
        raise RuntimeError("Cartella sorgente Fable 2 Asset Browser non valida")
    model_file = root / "source/src/UI/Panels/LeftPanel/Draw/Assets/ModelOrganizer.inl"
    if not model_file.exists():
        raise RuntimeError("Applicare PRIMA la modifica di categorie/selezione")
    optimizer_file = root / "source/src/ISO/IsoDump/Models/MobileOptimizer.inl"
    optimizer_file.parent.mkdir(parents=True, exist_ok=True)
    optimizer_file.write_text(OPTIMIZER, encoding='utf-8')

    def state_patch(s):
        marker = "    bool mdl_export_mobile_optimized = true;"
        if marker in s: return s
        return replace_one(s, "    std::string mdl_filter;",
                "    std::string mdl_filter;\n" + marker, "State.h")
    edit(root, "source/src/Utilities/State.h", state_patch)

    def cpp_patch(s):
        if '#include "IsoDump/Models/MobileOptimizer.inl"' in s:
            return s
        s = replace_one(s, '#include "IsoDump/Models/DumpConverted.inl"',
                '#include "IsoDump/Models/MobileOptimizer.inl"\n'
                '#include "IsoDump/Models/DumpConverted.inl"', "IsoDump.cpp includes")
        s = replace_one(s, "namespace ISO {",
                "#ifdef _WIN32\n#include <windows.h>\n#endif\n"
                "#include <cstring>\n\nnamespace ISO {", "IsoDump.cpp windows")
        return s
    edit(root, "source/src/ISO/IsoDump.cpp", cpp_patch)

    def converted_patch(s):
        marker = "try_export_mobile_glb(out);"
        if marker in s: return s
        return replace_one(s, '    if (ok) {\n        OutputLog::success',
            '    if (ok) {\n        if (fmt == MdlExportFormat::GLB && S.mdl_export_mobile_optimized)\n'
            '            try_export_mobile_glb(out);\n        OutputLog::success',
            "DumpConverted.inl success")
    edit(root, "source/src/ISO/IsoDump/Models/DumpConverted.inl", converted_patch)

    def ui_patch(s):
        if "GLB mobile automatico" in s: return s
        s = replace_one(s, 'const float footer_height = 3.2f *',
                'const float footer_height = 3.2f *', "ModelOrganizer footer")
        return replace_one(s, '        ImGui::Checkbox("Solo selezionati", &only_selected);',
            '        ImGui::Checkbox("GLB mobile automatico", &S.mdl_export_mobile_optimized);\n'
            '        if (!S.hide_tooltips && ImGui::IsItemHovered()) {\n'
            '            ImGui::BeginTooltip();\n'
            '            ImGui::TextUnformatted("Ogni export GLB genera anche _mobile.glb;");\n'
            '            ImGui::TextUnformatted("texture WebP, meshopt; originale invariato.");\n'
            '            ImGui::TextUnformatted("La versione mobile richiede MeshoptDecoder nel gioco.");\n'
            '            ImGui::EndTooltip();\n'
            '        }\n'
            '        ImGui::Checkbox("Solo selezionati", &only_selected);',
            "ModelOrganizer UI")
    edit(root, "source/src/UI/Panels/LeftPanel/Draw/Assets/ModelOrganizer.inl", ui_patch)
    print("Ottimizzazione GLB mobile integrata. Compilare Windows Release.")
    
if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Utilizzo: python enable_mobile_export.py CARTELLA_REPOSITORY")
    main(sys.argv[1])
