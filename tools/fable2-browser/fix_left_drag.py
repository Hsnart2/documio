#!/usr/bin/env python3
"""Fix inverted left-click drag/orbit in Fable 2 Asset Browser.
Apply after previous selection, mobile export and Unity-style navigation patches.
"""
from pathlib import Path
import sys

def patch(root, relative, before, after):
    f = root / "source/src" / relative
    content = f.read_text(encoding="utf-8")
    if before not in content:
        if after in content:
            print("Already patched:", relative)
            return
        raise RuntimeError(f"Source anchor missing for {relative}: {before[:110]!r}")
    f.write_text(content.replace(before, after, 1), encoding="utf-8", newline="\n")
    print("Updated:", relative)

def main(root):
    root = Path(root).resolve()
    if not (root / "source/CMakeLists.txt").is_file():
        raise RuntimeError("Invalid Fable 2 Asset Browser source root")

    patch(root, "Utilities/State.h",
        '''    bool  cam_invert_x = false;
    bool  cam_invert_y = false;''',
        '''    bool  cam_invert_x = false;
    bool  cam_invert_y = false;
    // The model follows the cursor when dragged with the left mouse.
    // The user can switch either axis to the previous orbit direction.
    bool  orbit_drag_natural_x = true;
    bool  orbit_drag_natural_y = true;''')

    patch(root,
        "UI/Layout/RenderPanel/DirectX/ModelView/Interaction/SkeletonCameraAndRender.inl",
        '''            S.cam_yaw   += d.x * kOrbitSensitivity;
            S.cam_pitch += d.y * kOrbitSensitivity;''',
        '''            S.cam_yaw   += (S.orbit_drag_natural_x ? -d.x : d.x)
                           * kOrbitSensitivity;
            S.cam_pitch += (S.orbit_drag_natural_y ? -d.y : d.y)
                           * kOrbitSensitivity;''')

    patch(root, "UI/Layout/RenderPanel/OpenGL/ModelView.inl",
        '''            S.cam_yaw += d.x * kOrbitSensitivity;
            S.cam_pitch += d.y * kOrbitSensitivity;''',
        '''            S.cam_yaw += (S.orbit_drag_natural_x ? -d.x : d.x)
                         * kOrbitSensitivity;
            S.cam_pitch += (S.orbit_drag_natural_y ? -d.y : d.y)
                           * kOrbitSensitivity;''')

    patch(root,
        "UI/Layout/RenderPanel/DirectX/ModelView/Controls/ViewportOverlays.inl",
        '''ImVec2(origin.x + (scene_navigation_controls ? 254 : 196),
                             origin.y + (scene_navigation_controls ? 145 : 70))''',
        '''ImVec2(origin.x + (scene_navigation_controls ? 254 : 248),
                             origin.y + (scene_navigation_controls ? 145 : 137))''')

    patch(root,
        "UI/Layout/RenderPanel/DirectX/ModelView/Controls/ViewportOverlays.inl",
        '''        ImGui::TextDisabled("Shift: boost  |  F: recenter");
    }

    float next_overlay_y = origin.y +
        (scene_navigation_controls ? 151.0f : 76.0f);''',
        '''        ImGui::TextDisabled("Shift: boost  |  F: recenter");
    } else {
        ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 70));
        ImGui::Checkbox("Mouse X naturale##orbit_drag_x",
                        &S.orbit_drag_natural_x);
        ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 100));
        ImGui::Checkbox("Mouse Y naturale##orbit_drag_y",
                        &S.orbit_drag_natural_y);
        if (!S.hide_tooltips && ImGui::IsItemHovered()) {
            ImGui::SetTooltip("Disattiva per invertire l'asse verticale.");
        }
    }

    float next_overlay_y = origin.y +
        (scene_navigation_controls ? 151.0f : 143.0f);''')
    print("Left-drag orbit controls are now natural by default, with separate X/Y toggles.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python fix_left_drag.py SOURCE_DIRECTORY")
    main(sys.argv[1])
