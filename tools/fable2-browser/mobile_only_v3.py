#!/usr/bin/env python3
"""Fable2 Asset Browser: export mobile-first GLB without keeping a giant raw copy.
Apply after enable_mobile_export.py and original selection/categories patch.
GPL-3.0 patch to the source; no Fable 2 assets included.
"""
from pathlib import Path
import sys

OPTIMIZER = r'''// Output optimized GLB via pinned gltfpack (MIT).
// Store _mobile.glb only when compression succeeds and is smaller.
// Original is preserved when explicitly selected, otherwise a raw temporary
// GLB is removed only after validation. No game archives are modified.
static bool try_export_mobile_glb(
    const std::filesystem::path& source_path,
    const std::filesystem::path& optimized_path) {
#ifdef _WIN32
    wchar_t exe_path[32768] = {};
    const DWORD used = GetModuleFileNameW(
        nullptr, exe_path, DWORD(sizeof(exe_path) / sizeof(exe_path[0])));
    if (!used || used >= DWORD(sizeof(exe_path) / sizeof(exe_path[0]))) {
        OutputLog::warn("GLB mobile: cartella programma non disponibile.");
        return false;
    }
    std::error_code ec;
    const std::filesystem::path tool =
        std::filesystem::path(exe_path).parent_path() / L"gltfpack.exe";
    if (!std::filesystem::is_regular_file(tool, ec)) {
        OutputLog::error("GLB mobile: gltfpack.exe mancante nella cartella del browser.");
        return false;
    }
    const std::filesystem::path temporary_path = optimized_path.parent_path() /
        (optimized_path.stem().wstring() + L"_in_compressione.glb");
    if (temporary_path == source_path || optimized_path == source_path) return false;
    std::filesystem::remove(temporary_path, ec);

    // Quality presets: 0 fidelity, 1 mobile default, 2 ultra-light.
    const int quality = S.mdl_export_quality_preset;
    std::wstring tuning =
        quality == 0 ? L" -ts 0.75 -si 1 -tq 8"
        : quality == 2 ? L" -ts 0.25 -si 0.65 -tq 5"
                       : L" -ts 0.5 -si 0.85 -tq 6";
    // Keep named nodes, materials, extras. WebP alpha is supported.
    // EXT_meshopt_compression & EXT_texture_webp require loader support.
    std::wstring command = L"\"" + tool.wstring() + L"\" -i \"" +
        source_path.wstring() + L"\" -o \"" + temporary_path.wstring() +
        L"\" -cc -tw -kn -km -ke" + tuning;

    STARTUPINFOW startup = {};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION proc = {};
    if (!CreateProcessW(tool.c_str(), command.data(), nullptr, nullptr,
                        FALSE, CREATE_NO_WINDOW, nullptr, nullptr,
                        &startup, &proc)) {
        OutputLog::error("GLB mobile: gltfpack non avviato; originale recuperabile.");
        return false;
    }
    const DWORD waited = WaitForSingleObject(proc.hProcess, 15 * 60 * 1000);
    DWORD exit_code = 1;
    if (waited == WAIT_OBJECT_0) {
        GetExitCodeProcess(proc.hProcess, &exit_code);
    } else {
        TerminateProcess(proc.hProcess, 1);
        WaitForSingleObject(proc.hProcess, 10000);
    }
    CloseHandle(proc.hThread);
    CloseHandle(proc.hProcess);

    auto cleanup = [&]() {
        std::error_code ignore;
        std::filesystem::remove(temporary_path, ignore);
    };
    if (waited != WAIT_OBJECT_0 || exit_code != 0) {
        cleanup();
        OutputLog::warn("GLB mobile: conversione non riuscita; originale preservato.");
        return false;
    }
    std::ifstream in(temporary_path, std::ios::binary);
    char header[4] = {};
    const bool has_magic = !!in.read(header, 4) &&
                           std::memcmp(header, "glTF", 4) == 0;
    in.close();
    if (!has_magic) {
        cleanup();
        OutputLog::error("GLB mobile: formato di uscita non valido.");
        return false;
    }
    const auto original_bytes = std::filesystem::file_size(source_path, ec);
    if (ec || original_bytes == 0) { cleanup(); return false; }
    const auto optimized_bytes = std::filesystem::file_size(temporary_path, ec);
    if (ec || optimized_bytes == 0 || optimized_bytes >= original_bytes) {
        cleanup();
        OutputLog::warn("GLB mobile: file ottimizzato non piu' piccolo. "
                        "Conservato l'originale.");
        return false;
    }
    // Only replace a previous _mobile file after the replacement has passed checks.
    // Windows cannot rename over an existing destination, so use a backup.
    const std::filesystem::path backup_path = optimized_path.parent_path() /
        (optimized_path.stem().wstring() + L"_backup_glb.tmp");
    const bool had_previous = std::filesystem::exists(optimized_path, ec);
    if (had_previous) {
        std::filesystem::remove(backup_path, ec);
        std::filesystem::rename(optimized_path, backup_path, ec);
        if (ec) { cleanup(); return false; }
    }
    std::filesystem::rename(temporary_path, optimized_path, ec);
    if (ec) {
        if (had_previous) {
            std::error_code restore_err;
            std::filesystem::rename(backup_path, optimized_path, restore_err);
        }
        cleanup();
        OutputLog::error("GLB mobile: impossibile salvare il risultato.");
        return false;
    }
    if (had_previous) std::filesystem::remove(backup_path, ec);
    const int saved = static_cast<int>(
        (1.0 - double(optimized_bytes) / double(original_bytes)) * 100.0 + 0.5);
    OutputLog::success("GLB MOBILE: " + optimized_path.filename().string() +
        " - " + std::to_string(optimized_bytes / 1024) + " KB invece di " +
        std::to_string(original_bytes / 1024) + " KB (risparmio " +
        std::to_string(saved) + "%).");
    return true;
#else
    (void)source_path; (void)optimized_path;
    return false;
#endif
}
'''

def change_file(root: Path, rel: str, before: str, after: str):
    p = root / rel
    s = p.read_text(encoding="utf-8")
    if after in s:
        return
    if before not in s:
        raise RuntimeError(f"Non trovo il punto per {rel}: {before[:100]!r}")
    p.write_text(s.replace(before, after, 1), encoding="utf-8", newline="\n")
    print("Aggiornato", rel)

def main(root: Path):
    root = root.resolve()
    optimizer = root / "source/src/ISO/IsoDump/Models/MobileOptimizer.inl"
    if not optimizer.is_file():
        raise RuntimeError("Prima eseguire enable_mobile_export.py")
    optimizer.write_text(OPTIMIZER, encoding="utf-8", newline="\n")

    change_file(root, "source/src/Utilities/State.h",
        "    bool mdl_export_mobile_optimized = true;",
        "    bool mdl_export_mobile_optimized = true;\n"
        "    bool mdl_export_keep_original = false;\n"
        "    int mdl_export_quality_preset = 1;")

    converted_rel = "source/src/ISO/IsoDump/Models/DumpConverted.inl"
    change_file(root, converted_rel, "    bool ok = false;\n    std::string err;",
        "    // Mobile-only writes to a temporary GLB, avoiding huge raw outputs.\n"
        "    const bool mobile_only = fmt == MdlExportFormat::GLB &&\n"
        "        S.mdl_export_mobile_optimized && !S.mdl_export_keep_original;\n"
        "    std::filesystem::path working_glb = out;\n"
        "    const std::filesystem::path mobile_glb = out.parent_path() /\n"
        "        (out.stem().wstring() + L\"_mobile.glb\");\n"
        "    if (mobile_only) {\n"
        "        working_glb = out.parent_path() /\n"
        "            (out.stem().wstring() + L\"_f2ab_export_temp.glb\");\n"
        "    }\n"
        "    bool ok = false;\n    std::string err;")
    change_file(root, converted_rel,
        "ok = mdl_to_glb_full(buf, out.string(), out_rel, err);",
        "ok = mdl_to_glb_full(buf, working_glb.string(), out_rel, err);")
    change_file(root, converted_rel,
        '''    if (ok) {
        if (fmt == MdlExportFormat::GLB && S.mdl_export_mobile_optimized)
            try_export_mobile_glb(out);
        OutputLog::success(std::string("Exported ") + log_label +
                           " as " + mdl_fmt_label(fmt) + " -> " +
                           out.string());
''',
        '''    if (ok) {
        bool mobile_ok = false;
        if (fmt == MdlExportFormat::GLB && S.mdl_export_mobile_optimized) {
            mobile_ok = try_export_mobile_glb(working_glb, mobile_glb);
            if (mobile_only) {
                if (mobile_ok) {
                    // Never remove an older existing original GLB at 'out'.
                    std::error_code cleanup_ec;
                    std::filesystem::remove(working_glb, cleanup_ec);
                } else {
                    // Keep a usable uncompressed GLB when optimization fails.
                    std::error_code fallback_ec;
                    if (!std::filesystem::exists(out, fallback_ec)) {
                        std::filesystem::rename(working_glb, out, fallback_ec);
                        if (fallback_ec)
                            OutputLog::warn("GLB mobile: conserva il file temporaneo: " +
                                             working_glb.string());
                    } else {
                        // Existing original is safe, remove only new temporary.
                        std::filesystem::remove(working_glb, fallback_ec);
                    }
                }
            }
        }
        OutputLog::success(std::string("Exported ") + log_label +
                           " as " + mdl_fmt_label(fmt) + " -> " +
                           (mobile_only && mobile_ok ? mobile_glb : out).string());
''')
    ui_rel = "source/src/UI/Panels/LeftPanel/Draw/Assets/ModelOrganizer.inl"
    change_file(root, ui_rel,
        '''        ImGui::Checkbox("GLB mobile automatico", &S.mdl_export_mobile_optimized);
        if (!S.hide_tooltips && ImGui::IsItemHovered()) {
            ImGui::BeginTooltip();
            ImGui::TextUnformatted("Ogni export GLB genera anche _mobile.glb;");
            ImGui::TextUnformatted("texture WebP, meshopt; originale invariato.");
            ImGui::TextUnformatted("La versione mobile richiede MeshoptDecoder nel gioco.");
            ImGui::EndTooltip();
        }
''',
        '''        ImGui::Checkbox("Esporta GLB mobile leggero", &S.mdl_export_mobile_optimized);
        if (S.mdl_export_mobile_optimized) {
            static const char* mobile_modes[] = {
                "Qualita alta - dettagli massimi",
                "Mobile - dimensione ridotta",
                "Ultra - dimensione minima"
            };
            ImGui::SetNextItemWidth(-1);
            ImGui::Combo("##qualita_glb_mobile", &S.mdl_export_quality_preset,
                         mobile_modes, IM_ARRAYSIZE(mobile_modes));
            ImGui::Checkbox("Salva anche originale pesante",
                            &S.mdl_export_keep_original);
            if (!S.hide_tooltips && ImGui::IsItemHovered()) {
                ImGui::BeginTooltip();
                ImGui::TextUnformatted("OFF: resta solo *_mobile.glb (default).");
                ImGui::TextUnformatted("ON: salva anche il GLB completo non compresso.");
                ImGui::TextUnformatted("I vecchi originali gia' presenti non vengono eliminati.");
                ImGui::EndTooltip();
            }
            ImGui::TextDisabled("Il file mobile richiede MeshoptDecoder + WebP nel gioco.");
        }
''')
    print("Mobile-only GLB + quality presets installati; procedere alla compilazione Windows.")

if __name__ == "__main__":
    if len(sys.argv) != 2: sys.exit("Utilizzo: python mobile_only_v3.py PATH_REPOSITORY")
    main(Path(sys.argv[1]))
