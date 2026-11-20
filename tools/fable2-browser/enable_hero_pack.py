#!/usr/bin/env python3
"""Build a portable male+female Hero Designer pack with every hair/accessory variant.
Apply AFTER enable_hero_export.py. All variant GLBs share the hero bone naming
and have no duplicated animation clips. Source game files are never modified.
"""
from pathlib import Path
import sys

def change(root, path, before, after):
    file=root/"source/src"/path
    source=file.read_text(encoding="utf-8")
    if before not in source:
        if after in source:
            print("Already changed",path)
            return
        raise RuntimeError(f"Anchor missing in {path}: {before[:110]}")
    file.write_text(source.replace(before,after,1),encoding="utf-8",newline="\n")
    print("Changed",path)

EXPORT_PACK = r'''
// Export full independent male/female base heroes and each catalogued optional
// hairstyle, facial hair, headwear, mask and accessory. Accessories are
// exported with the same rig but without repeating the base character mesh.
struct HeroPackPart {
    std::uint32_t hash = 0;
    std::string name;
    std::string source;
    Slot category = Slot::Hair;
};

struct HeroPackGender {
    Sex sex = Sex::Male;
    std::uint32_t body_hash = 0;
    std::uint32_t animation_source_hash = 0;
    std::vector<std::uint32_t> base_hashes;
    std::vector<HeroPackPart> parts;
    std::string model_path;
};

const char* hero_pack_category(Slot slot) {
    switch (slot) {
        case Slot::Hair: return "Hair";
        case Slot::Beard: return "Beard";
        case Slot::Moustache: return "Moustache";
        case Slot::Hat: return "Hat";
        case Slot::Mask: return "Mask";
        case Slot::Accessories: return "Accessories";
        case Slot::Coat: return "Coat";
        case Slot::Shirt: return "Shirt";
        case Slot::Gloves: return "Gloves";
        case Slot::Trousers: return "Trousers";
        case Slot::Boots: return "Boots";
        case Slot::Suit: return "Suit";
        case Slot::Melee: return "Melee";
        case Slot::Ranged: return "Ranged";
        default: return "Other";
    }
}

std::string hero_pack_json_escape(const std::string& raw) {
    std::string result;
    result.reserve(raw.size()+12);
    static const char* digits="0123456789abcdef";
    for (unsigned char ch : raw) {
        switch (ch) {
            case '\\': result+="\\\\"; break;
            case '"': result+="\\\""; break;
            case '\n': result+="\\n"; break;
            case '\r': result+="\\r"; break;
            case '\t': result+="\\t"; break;
            default:
                if (ch < 32) {
                    result+="\\u00";
                    result+=digits[ch>>4];
                    result+=digits[ch&15];
                } else result.push_back(char(ch));
        }
    }
    return result;
}

std::vector<HeroPackGender> hero_pack_collect(bool include_clothing) {
    DesignerState& designer = state();
    const Sex original_sex=designer.sex;
    const auto original_slots=designer.slots;
    std::vector<HeroPackGender> genders;
    for (Sex sex : {Sex::Male, Sex::Female}) {
        // Rebuild the option catalog for each gender without changing the
        // editor's visible selection or queued preview after we leave.
        designer.sex=sex;
        rebuild_catalog(false);
        HeroPackGender pack;
        pack.sex=sex;
        const FlatAssetEntry* body=hero_body_asset(sex,"body");
        const FlatAssetEntry* face=hero_body_asset(sex,"thin");
        if (!body || !face) {
            OutputLog::warn(std::string("Hero pack: corpo/volto assente per ") +
                            (sex==Sex::Male ? "uomo" : "donna"));
            continue;
        }
        pack.model_path=body->full_path;
        pack.body_hash=Anim::gdb_model_path_hash(body->full_path);
        pack.base_hashes=base_hero_hashes(
            sex,pack.body_hash,Anim::gdb_model_path_hash(face->full_path),
            &pack.animation_source_hash);
        std::vector<Slot> categories {
            Slot::Hair, Slot::Beard, Slot::Moustache,
            Slot::Hat, Slot::Mask, Slot::Accessories
        };
        if (include_clothing) {
            for(Slot slot : {Slot::Coat,Slot::Shirt,Slot::Gloves,
                             Slot::Trousers,Slot::Boots,Slot::Suit,
                             Slot::Melee,Slot::Ranged}) {
                categories.push_back(slot);
            }
        }
        std::unordered_set<std::string> seen;
        for(Slot category : categories) {
            if (sex==Sex::Female &&
                (category==Slot::Beard || category==Slot::Moustache)) continue;
            const auto& items=designer.slots[static_cast<size_t>(category)].options;
            for(size_t i=1;i<items.size();++i) {
                const Option& item=items[i];
                if(!item.hash) continue;
                std::string id=std::string(hero_pack_category(category))+
                               ":"+std::to_string(item.hash);
                if (!seen.insert(id).second) continue;
                pack.parts.push_back({item.hash,item.label,
                                     item.path,category});
            }
        }
        genders.push_back(std::move(pack));
    }
    designer.sex=original_sex;
    designer.slots=original_slots;
    return genders;
}

void hero_pack_export(std::vector<HeroPackGender> genders,
                      bool all_clips, const std::filesystem::path output) {
    const int total = 2 + static_cast<int>(
        genders.size()>0 ? genders[0].parts.size() : 0) +
        static_cast<int>(genders.size()>1 ? genders[1].parts.size() : 0);
    progress_open(std::max(1,total),"Esportazione pacchetto Hero uomo+donna...");
    std::thread([genders=std::move(genders),output,all_clips,total]()mutable {
        struct Guard {
            ~Guard() {
                progress_done();
                g_hero_export_busy.store(false);
            }
        } guard;
        try {
            std::error_code ec;
            std::filesystem::create_directories(output,ec);
            if(ec) {
                OutputLog::error("Hero pack: impossibile creare cartella "+ec.message());
                return;
            }
            std::ostringstream catalog;
            catalog << "{\n  \"version\":1,\n"
                    << "  \"description\":\"Hero Designer male and female export\",\n"
                    << "  \"skeletons\":[\n";
            bool first_hero=true;
            std::vector<std::string> part_lines;
            int complete=0,failed=0,step=0;
            for (const HeroPackGender& gender : genders) {
                if(S.cancel_requested.load()||S.exiting.load()) break;
                const char* sex=gender.sex==Sex::Male?"Male":"Female";
                EntityModels::ResolvedModel model;
                EntityModels::ResolveOptions cfg;
                cfg.preferred_primary_hash=gender.body_hash;
                std::string err;
                const bool loaded=EntityModels::Resolve(
                    gender.base_hashes,model,&err,&cfg);
                int anims=0;
                const std::filesystem::path base=output/
                    (std::string("Hero_")+sex+"_Base_Animated.glb");
                bool saved=false;
                if(loaded && !model.meshes.empty()) {
                    saved=mdl_to_glb_from_geometry(
                        model.info,model.meshes,base.string(),
                        gender.model_path,err,gender.animation_source_hash,
                        gender.base_hashes,all_clips,&anims);
                }
                ++step;
                progress_update(step,total,std::string("Hero ")+sex);
                if(saved) {
                    ++complete;
                    if(!first_hero) catalog<<",\n";
                    first_hero=false;
                    catalog<<"    {\"sex\":\""<<sex<<"\",\"file\":\""
                           <<base.filename().string()
                           <<"\",\"animationCount\":"<<anims<<"}";
                    OutputLog::success(std::string("Hero ")+sex+
                        " base: "+std::to_string(anims)+" animazioni");
                }else{
                    ++failed;
                    OutputLog::warn(std::string("Hero ")+sex+
                        " export non riuscito: "+err);
                }
                // Each optional part is exported with a matching skeleton,
                // but without duplicating the body, eyes or animation data.
                for(const HeroPackPart& part : gender.parts) {
                    if(S.cancel_requested.load()||S.exiting.load()) break;
                    ++step;
                    std::string category=hero_pack_category(part.category);
                    progress_update(step,total,std::string(sex)+"/"+category);
                    std::vector<uint32_t> hashes=gender.base_hashes;
                    append_unique(hashes,part.hash);
                    EntityModels::ResolvedModel assembled;
                    std::string part_error;
                    if(!EntityModels::Resolve(hashes,assembled,&part_error,&cfg)){
                        ++failed;
                        OutputLog::warn("Hero asset non disponibile: "+part.source);
                        continue;
                    }
                    auto& meshes=assembled.meshes;
                    meshes.erase(std::remove_if(meshes.begin(),meshes.end(),
                        [&](const MDLMeshGeom& m) {
                            return m.source_model_hash!=part.hash;
                        }),meshes.end());
                    if(meshes.empty()) {
                        ++failed;
                        OutputLog::warn("Hero asset senza mesh: "+part.source);
                        continue;
                    }
                    const std::filesystem::path folder=output/"Variants"/sex/category;
                    std::filesystem::create_directories(folder,ec);
                    if(ec){++failed;ec.clear();continue;}
                    // Use stable names even when localized labels have
                    // unsupported Windows characters or are duplicated.
                    const std::filesystem::path file=folder/
                        (category+"_"+std::to_string(part.hash)+".glb");
                    // Passing include_animations=false prevents adding
                    // hundreds of clips to every hairstyle/accessory.
                    if(!mdl_to_glb_from_geometry(
                          assembled.info,meshes,file.string(),
                          part.source,part_error,0,{},false,nullptr,false)) {
                        ++failed;
                        OutputLog::warn("Hero asset fallito: "+part.source+
                                        " ("+part_error+")");
                        continue;
                    }
                    ++complete;
                    std::ostringstream line;
                    line<<"    {\"sex\":\""<<sex
                        <<"\",\"category\":\""<<category
                        <<"\",\"name\":\""<<hero_pack_json_escape(part.name)
                        <<"\",\"file\":\"Variants/"<<sex<<"/"<<category<<"/"
                        <<file.filename().string()
                        <<"\",\"source\":\""
                        <<hero_pack_json_escape(part.source)
                        <<"\"}";
                    part_lines.push_back(line.str());
                }
            }
            catalog<<"\n  ],\n  \"variants\":[\n";
            for(size_t i=0;i<part_lines.size();++i) {
                if(i>0)catalog<<",\n";
                catalog<<part_lines[i];
            }
            catalog<<"\n  ],\n  \"exportedFiles\":"<<complete
                   <<",\n  \"failedFiles\":"<<failed<<"\n}\n";
            {
                std::ofstream f(output/"manifest.json",std::ios::binary);
                f<<catalog.str();
            }
            {
                std::ofstream f(output/"LEGGIMI.txt",std::ios::binary);
                f << "Hero Designer - Pacchetto uomo e donna\n"
                  << "Hero_Male_Base_Animated.glb + Hero_Female_Base_Animated.glb\n"
                  << "Varianti: Hair, Beard, Moustache, Hat, Mask, Accessories.\n"
                  << "Con opzione estesa: abbigliamento e armi.\n"
                  << "Ogni variante contiene solo la sua geometria e il rig,\n"
                  << "senza copie dei corpi e delle animazioni.\n"
                  << "manifest.json: nomi, categorie, percorsi e conteggi.\n"
                  << "Attenzione: in game richiede collegamento/retargeting dei nodi\n"
                  << "e verifica licenze prima di distribuire asset originali.\n"
                  << "Esportati: "<<complete<<", non esportati: "<<failed<<"\n";
            }
            if(!S.exiting.load()){
                show_completion_box(
                    "Pacchetto Hero uomo+donna creato.\n"
                    "File esportati: "+std::to_string(complete)+
                    "\nNon esportati: "+std::to_string(failed)+
                    "\nCartella:\n"+output.string());
            }
            OutputLog::success("Hero pack: "+output.string()+
                " ("+std::to_string(complete)+" file, "+
                std::to_string(failed)+" non esportati)");
        }catch(const std::exception& ex){
            OutputLog::error(std::string("Hero pack: ")+ex.what());
        }catch(...){
            OutputLog::error("Hero pack: errore sconosciuto");
        }
    }).detach();
}
'''

def main(root):
    root=Path(root).resolve()
    if not (root/"source/CMakeLists.txt").exists():
        raise RuntimeError("Not a valid source folder")
    change(root,"MDL/mdl_converter.h",
        "    int* exported_animation_count = nullptr);",
        "    int* exported_animation_count = nullptr,\n"
        "    bool include_animations = true);")
    change(root,"MDL/mdl_converter.cpp",
        '''    bool all_compatible_animations,
    int* exported_animation_count)
{
    err_msg.clear();''',
        '''    bool all_compatible_animations,
    int* exported_animation_count,
    bool include_animations)
{
    err_msg.clear();''')
    change(root,"MDL/mdl_converter.cpp",
        '''    const std::vector<MdlExport::ExportAnimClip> export_anims =
        MdlExport::collect_compatible_animations(
            info, export_bone_count, original_to_node, mdl_source_path,
            animation_source_hash, animation_model_hashes,
            all_compatible_animations);''',
        '''    const std::vector<MdlExport::ExportAnimClip> export_anims =
        include_animations
            ? MdlExport::collect_compatible_animations(
                info, export_bone_count, original_to_node, mdl_source_path,
                animation_source_hash, animation_model_hashes,
                all_compatible_animations)
            : std::vector<MdlExport::ExportAnimClip>{};''')
    change(root,"UI/Hero/HeroDesigner.cpp",
        '''#include <ctime>
#include <filesystem>''',
        '''#include <ctime>
#include <fstream>
#include <filesystem>''')
    change(root,"UI/Hero/HeroDesigner.cpp",
        '''std::vector<std::string> hide_region_tokens(const std::string& value) {''',
        EXPORT_PACK+'\nstd::vector<std::string> hide_region_tokens(const std::string& value) {')
    change(root,"UI/Hero/HeroDesigner.cpp",
        '''    ImGui::EndChild();
}

}''',
        '''    ImGui::SeparatorText("Pacchetto completo per il game");
    static bool include_all_outfits=false;
    ImGui::Checkbox("Includi anche tutti i vestiti e le armi",
                    &include_all_outfits);
    ImGui::TextWrapped("Uomo + donna, tutti i capelli, barbe, cappelli, "
                       "maschere, accessori e animazioni compatibili.");
    const bool can_export_pack=designer.catalog_ready &&
        !designer.loading && !designer.preview_queued &&
        !g_hero_export_busy.load();
    if(!can_export_pack) ImGui::BeginDisabled();
    if(ImGui::Button("ESPORTA PACCHETTO HERO UOMO + DONNA",ImVec2(-1,0))) {
        std::vector<HeroPackGender> prepared=hero_pack_collect(
            include_all_outfits);
        if (prepared.empty()) {
            OutputLog::error("Hero pack: modelli uomo/donna non disponibili.");
        } else {
            g_hero_export_busy.store(true);
            const std::filesystem::path output_root=S.export_dir.empty()
                ? std::filesystem::current_path()/"exported_glb"
                : std::filesystem::path(S.export_dir);
            const std::filesystem::path dest=output_root/
                ("HeroPack_Uomo_Donna_"+
                 std::to_string(static_cast<long long>(std::time(nullptr))));
            // User asked for every animation compatible with either rig.
            hero_pack_export(std::move(prepared),true,dest);
        }
    }
    if(!can_export_pack) ImGui::EndDisabled();
    ImGui::EndChild();
}

}''')
    print("HeroPack export feature integrated.")
if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("Usage: enable_hero_pack.py SOURCE")
    main(sys.argv[1])
