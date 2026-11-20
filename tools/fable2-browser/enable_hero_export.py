#!/usr/bin/env python3
"""Add true composite Hero Designer GLB export (rig + clothing + authored animation clips).
Apply AFTER existing Fable2 selection, mobile and camera patches.
GPL-3.0 source patch; does not embed any copyrighted game assets.
"""
from pathlib import Path
import sys

def edit(root, path, old, new):
    p=root/"source/src"/path
    s=p.read_text(encoding="utf-8")
    if old not in s:
        if new in s:
            print("Already modified:",path)
            return
        raise RuntimeError("Expected anchor absent in "+path+": "+old[:140])
    p.write_text(s.replace(old,new,1),encoding="utf-8",newline="\n")
    print("Patched:",path)

def main(root):
    root=Path(root).resolve()
    if not (root/"source/CMakeLists.txt").exists():
        raise RuntimeError("Fable2 Asset Browser source directory required")

    edit(root,"MDL/mdl_converter.h",
'''#include <string>
#include <vector>

bool mdl_to_glb_file_ex''',
'''#include <string>
#include <vector>
#include <cstdint>
#include "ModelParser.h"

// Export a composite already assembled in memory (Hero Designer).
// Animations are retargeted to the composite's original bone hierarchy.
bool mdl_to_glb_from_geometry(
    const MDLInfo& info,
    const std::vector<MDLMeshGeom>& geoms,
    const std::string& glb_path,
    const std::string& mdl_source_path,
    std::string& err_msg,
    std::uint32_t animation_source_hash = 0,
    const std::vector<std::uint32_t>& animation_model_hashes = {},
    bool all_compatible_animations = false,
    int* exported_animation_count = nullptr);

bool mdl_to_glb_file_ex''')

    edit(root,"MDL/MdlExportCommon.h",
'''inline std::vector<size_t> compatible_animation_indices(
    const MDLInfo& info,
    uint32_t model_bone_count,
    const std::string& model_path) {''',
'''inline std::vector<size_t> compatible_animation_indices(
    const MDLInfo& info,
    uint32_t model_bone_count,
    const std::string& model_path,
    uint32_t animation_source_hash = 0,
    const std::vector<uint32_t>& animation_model_hashes = {},
    bool all_compatible_animations = false) {''')

    edit(root,"MDL/MdlExportCommon.h",
'''    std::vector<uint8_t> authored;
    size_t authored_count = 0;
    std::string path = model_path.empty() ? S.current_mdl_path : model_path;
    if (!path.empty()) {
        const uint32_t model_hash = Anim::gdb_model_path_hash(path);
        authored_count = Anim::build_model_animation_cache_for_hash(
            model_hash, S.anim_clips.size(), authored);
    }

    out.reserve(S.anim_clips.size());''',
'''    std::vector<uint8_t> authored;
    size_t authored_count = 0;
    if (!all_compatible_animations) {
        // Hero Designer records its actual composite's GDB animation scope.
        if (animation_source_hash != 0 || !animation_model_hashes.empty()) {
            std::vector<size_t> order;
            std::vector<std::string> names;
            authored_count = Anim::build_animation_cache_for_scope(
                animation_source_hash, animation_model_hashes,
                S.anim_clips.size(), authored, order, names);
        } else {
            // Maintain exact original behavior for single-model exports.
            std::string path = model_path.empty() ? S.current_mdl_path : model_path;
            if (!path.empty()) {
                const uint32_t model_hash = Anim::gdb_model_path_hash(path);
                authored_count = Anim::build_model_animation_cache_for_hash(
                    model_hash, S.anim_clips.size(), authored);
            }
        }
    }

    out.reserve(S.anim_clips.size());''')

    edit(root,"MDL/MdlExportCommon.h",
'''inline std::vector<ExportAnimClip> collect_compatible_animations(
    const MDLInfo& info,
    uint32_t model_bone_count,
    const std::vector<int>& original_to_target_node,
    const std::string& model_path) {''',
'''inline std::vector<ExportAnimClip> collect_compatible_animations(
    const MDLInfo& info,
    uint32_t model_bone_count,
    const std::vector<int>& original_to_target_node,
    const std::string& model_path,
    uint32_t animation_source_hash = 0,
    const std::vector<uint32_t>& animation_model_hashes = {},
    bool all_compatible_animations = false) {''')

    edit(root,"MDL/MdlExportCommon.h",
'''    const std::vector<size_t> candidates =
        compatible_animation_indices(info, model_bone_count, model_path);
    out.reserve(candidates.size());''',
'''    const std::vector<size_t> candidates =
        compatible_animation_indices(
            info, model_bone_count, model_path,
            animation_source_hash, animation_model_hashes,
            all_compatible_animations);
    out.reserve(candidates.size());''')

    edit(root,"MDL/mdl_converter.cpp",
'''    std::string model_name = std::filesystem::path(glb_path).stem().string();

    std::vector<uint8_t> bin_data;''',
'''    std::string model_name = std::filesystem::path(glb_path).stem().string();

    std::vector<uint8_t> bin_data;''') if False else None

    edit(root,"MDL/mdl_converter.cpp",
'''    std::string model_name = std::filesystem::path(glb_path).stem().string();''',
'''    std::string model_name = std::filesystem::path(glb_path).stem().string();''') if False else None

    edit(root,"MDL/mdl_converter.cpp",
'''    if (!MdlExport::parse_model_for_export(mdl_data, mdl_source_path,
                                           info, geoms, err_msg)) {
        return false;
    }

    std::string model_name = std::filesystem::path(glb_path).stem().string();''',
'''    if (!MdlExport::parse_model_for_export(mdl_data, mdl_source_path,
                                           info, geoms, err_msg)) {
        return false;
    }
    return mdl_to_glb_from_geometry(
        info, geoms, glb_path, mdl_source_path, err_msg);
}

bool mdl_to_glb_from_geometry(
    const MDLInfo& info,
    const std::vector<MDLMeshGeom>& geoms,
    const std::string& glb_path,
    const std::string& mdl_source_path,
    std::string& err_msg,
    std::uint32_t animation_source_hash,
    const std::vector<std::uint32_t>& animation_model_hashes,
    bool all_compatible_animations,
    int* exported_animation_count)
{
    err_msg.clear();
    if (exported_animation_count) *exported_animation_count = 0;
    if (geoms.empty()) {
        err_msg = "Hero has no geometry to export";
        return false;
    }
    std::string model_name = std::filesystem::path(glb_path).stem().string();''')

    edit(root,"MDL/mdl_converter.cpp",
'''    std::vector<int> original_to_node(info.BoneCount, -1);''',
'''    std::vector<int> original_to_node(
        std::max<size_t>(info.BoneCount, info.Bones.size()), -1);''')

    edit(root,"MDL/mdl_converter.cpp",
'''        std::vector<float> normals_xyz;
        normals_xyz.reserve(geom.normals.size());
        for (size_t i = 0; i < vcount; ++i) {
            normals_xyz.push_back(geom.normals[i*3+0]);
            normals_xyz.push_back(geom.normals[i*3+1]);
            normals_xyz.push_back(geom.normals[i*3+2]);
        }''',
'''        // Composite clothes and hair can have missing normals/UV arrays.
        // Do not read past their bounds; fill missing channels safely.
        std::vector<float> normals_xyz;
        normals_xyz.reserve(vcount * 3);
        for (size_t i = 0; i < vcount; ++i) {
            const size_t offset = i * 3;
            if (offset + 2 < geom.normals.size()) {
                normals_xyz.push_back(geom.normals[offset + 0]);
                normals_xyz.push_back(geom.normals[offset + 1]);
                normals_xyz.push_back(geom.normals[offset + 2]);
            } else {
                normals_xyz.push_back(0.f);
                normals_xyz.push_back(1.f);
                normals_xyz.push_back(0.f);
            }
        }
        std::vector<float> uv_coords(vcount * 2, 0.0f);
        const size_t uv_copy = std::min(geom.uvs.size(), uv_coords.size());
        std::copy_n(geom.uvs.begin(), uv_copy, uv_coords.begin());''')

    edit(root,"MDL/mdl_converter.cpp",
'''        size_t uv_offset = add_data(geom.uvs.data(), geom.uvs.size() * sizeof(float));''',
'''        size_t uv_offset = add_data(uv_coords.data(), uv_coords.size() * sizeof(float));''')
    edit(root,"MDL/mdl_converter.cpp",
r'''        bufferViews << "{\"buffer\":0,\"byteOffset\":" << uv_offset << ",\"byteLength\":" << (geom.uvs.size() * sizeof(float)) << ",\"target\":34962}";''',
r'''        bufferViews << "{\"buffer\":0,\"byteOffset\":" << uv_offset << ",\"byteLength\":" << (uv_coords.size() * sizeof(float)) << ",\"target\":34962}";''')
    edit(root,"MDL/mdl_converter.cpp",
r'''        accessors << "{\"bufferView\":" << uv_bv << ",\"componentType\":5126,\"count\":" << (geom.uvs.size()/2) << ",\"type\":\"VEC2\"}";''',
r'''        accessors << "{\"bufferView\":" << uv_bv << ",\"componentType\":5126,\"count\":" << (uv_coords.size()/2) << ",\"type\":\"VEC2\"}";''')
    edit(root,"MDL/mdl_converter.cpp",
'''        if (!geom.bone_ids.empty() && !geom.bone_weights.empty() && !valid_bones.empty()) {''',
'''        if (geom.bone_ids.size() == vcount * 4 &&
            geom.bone_weights.size() == vcount * 4 &&
            !valid_bones.empty()) {''')

    edit(root,"MDL/mdl_converter.cpp",
'''    const std::vector<MdlExport::ExportAnimClip> export_anims =
        MdlExport::collect_compatible_animations(
            info, export_bone_count, original_to_node, mdl_source_path);''',
'''    const std::vector<MdlExport::ExportAnimClip> export_anims =
        MdlExport::collect_compatible_animations(
            info, export_bone_count, original_to_node, mdl_source_path,
            animation_source_hash, animation_model_hashes,
            all_compatible_animations);''')

    edit(root,"MDL/mdl_converter.cpp",
'''    if (!out.good()){
        err_msg = "GLB write failed";
        return false;
    }
    return true;
}''',
'''    if (!out.good()){
        err_msg = "GLB write failed";
        return false;
    }
    if (exported_animation_count) *exported_animation_count = anim_count;
    return true;
}''')

    hero = "UI/Hero/HeroDesigner.cpp"
    edit(root,hero,
'''#include "../../animations/AnimBank.h"
#include "../../BNKReader.cpp"''',
'''#include "../../animations/AnimBank.h"
#include "../../MDL/mdl_converter.h"
#include "../../Utilities/Progress.h"
#include "../../BNKReader.cpp"''')
    edit(root,hero,
'''#include <cstdint>
#include <filesystem>''',
'''#include <cstdint>
#include <ctime>
#include <filesystem>''')

    edit(root,hero,
'''namespace HeroDesigner {
namespace {

enum class Sex { Male, Female };''',
'''namespace HeroDesigner {
namespace {

std::atomic<bool> g_hero_export_busy{false};
bool g_hero_export_all_compatible = false;

enum class Sex { Male, Female };''')

    edit(root,hero,
'''    if (ImGui::Button("Rebuild preview", ImVec2(-1, 0))) {
        request_preview();
    }
    ImGui::EndChild();
}''',
'''    if (ImGui::Button("Rebuild preview", ImVec2(-1, 0))) {
        request_preview();
    }

    ImGui::SeparatorText("Esporta Hero completo");
    ImGui::TextWrapped("Esporta la versione assemblata che vedi: "
                       "corpo, volto, capelli, vestiti e scheletro.");
    ImGui::Checkbox("Includi anche le altre animazioni compatibili",
                    &g_hero_export_all_compatible);
    if (!S.hide_tooltips && ImGui::IsItemHovered()) {
        ImGui::SetTooltip(
            "OFF: tutte le animazioni associate a Hero. "
            "ON: anche animazioni di altri modelli con lo stesso rig. "
            "Il file puo' diventare grande.");
    }
    const bool can_export = designer.morph_cache &&
        !designer.loading && !designer.preview_queued &&
        !g_hero_export_busy.load();
    if (!can_export) ImGui::BeginDisabled();
    if (ImGui::Button("ESPORTA HERO + ANIMAZIONI (GLB)", ImVec2(-1, 0))) {
        g_hero_export_busy.store(true);
        const auto cache = designer.morph_cache;
        const MorphState morph_snapshot = designer.morph;
        const bool male = designer.sex == Sex::Male;
        const bool include_all = g_hero_export_all_compatible;
        const std::filesystem::path export_root = S.export_dir.empty()
            ? std::filesystem::current_path() / "exported_glb" / "HeroDesigner"
            : std::filesystem::path(S.export_dir) / "HeroDesigner";
        progress_open(1, "Esportazione Hero completo e animazioni...");
        std::thread([cache, morph_snapshot, male, include_all, export_root]() {
            struct Guard {
                ~Guard() {
                    progress_done();
                    g_hero_export_busy.store(false);
                }
            } guard;
            try {
                if (S.exiting.load() || S.cancel_requested.load()) return;
                EntityModels::ResolvedModel model =
                    build_morphed_model(*cache, morph_snapshot);
                if (model.meshes.empty()) {
                    OutputLog::error("Hero export: nessuna mesh esportabile");
                    return;
                }
                std::error_code ec;
                std::filesystem::create_directories(export_root, ec);
                if (ec) {
                    OutputLog::error("Hero export: cartella non accessibile: " +
                                     ec.message());
                    return;
                }
                const std::string name = std::string("Hero_") +
                    (male ? "Male" : "Female") + "_Completo_" +
                    std::to_string(static_cast<long long>(std::time(nullptr))) +
                    ".glb";
                const auto dest = export_root / name;
                int animations_written = 0;
                std::string error;
                const bool ok = mdl_to_glb_from_geometry(
                    model.info, model.meshes, dest.string(),
                    model.primary_model_path, error,
                    cache->animation_source_hash,
                    cache->animation_model_hashes,
                    include_all, &animations_written);
                if (!ok) {
                    OutputLog::error("Hero export fallito: " + error);
                    return;
                }
                OutputLog::success("Hero completo esportato: " +
                    dest.string() + " (animazioni: " +
                    std::to_string(animations_written) + ")");
                if (animations_written == 0)
                    OutputLog::warn("Hero export: nessuna animazione "
                                    "convertita. Verifica Animations e TOC.");
                show_completion_box(
                    "Hero completo esportato con " +
                    std::to_string(animations_written) +
                    " animazioni nel GLB.\\\\n\\\\nFile:\\\\n" +
                    dest.string());
            } catch (const std::exception& e) {
                OutputLog::error(std::string("Hero export: ") + e.what());
            } catch (...) {
                OutputLog::error("Hero export: errore sconosciuto");
            }
        }).detach();
    }
    if (!can_export) ImGui::EndDisabled();
    if (g_hero_export_busy.load()) {
        ImGui::TextDisabled("Esportazione Hero in corso...");
    } else if (!designer.morph_cache) {
        ImGui::TextDisabled("Crea prima l'anteprima Hero.");
    }
    ImGui::EndChild();
}''')

    print("Composite Hero Designer GLB export with animations enabled.")
if __name__=="__main__":
    if len(sys.argv)!=2: raise SystemExit("Usage: enable_hero_export.py PATH_TO_FABLE2_SOURCE")
    main(sys.argv[1])
