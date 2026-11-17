#!/usr/bin/env python3
"""Enable Unity-like free navigation in Fable 2 Asset Browser scene / Levels preview.

Apply on top of the selection/categories/mobile-only patches.
All changes are source-only; the application retains the existing export features.
"""
from pathlib import Path
import sys

def replace(path: Path, before: str, after: str, label: str):
    source = path.read_text(encoding="utf-8")
    if after in source and before not in source:
        print("Already patched:", label)
        return
    if before not in source:
        raise RuntimeError(f"Missing source anchor for {label}: {before[:120]!r}")
    path.write_text(source.replace(before, after, 1), encoding="utf-8", newline="\n")
    print("Patched:", label)

def main(root: Path):
    root = root.resolve()
    src = root / "source/src"
    if not (root / "source/CMakeLists.txt").is_file():
        raise RuntimeError(f"Not a Fable 2 Asset Browser source tree: {root}")

    state = src / "Utilities/State.h"
    replace(state,
        "    bool terrain_mode = false;",
        "    bool terrain_mode = false;\n"
        "    // Active by default for inspecting interior and exterior levels.\n"
        "    // Disable to use W/E as level editor gizmo shortcuts.\n"
        "    bool level_fly_navigation_enabled = true;",
        "persistent fly navigation toggle")

    setup = src / "UI/Layout/RenderPanel/DirectX/ModelView/Scene/Setup.inl"
    replace(setup,
        '''    ImGui::InvisibleButton("##model_render", region);
    bool hovered = ImGui::IsItemHovered();
    bool active  = ImGui::IsItemActive();
''',
        '''    ImGui::InvisibleButton("##model_render", region);
    bool hovered = ImGui::IsItemHovered();
    bool active  = ImGui::IsItemActive();
    // Clicking the viewport gives it keyboard focus until another widget is used.
    // Mouse hover also works, so walking doesn't require holding RMB.
    if (hovered && ImGui::IsMouseClicked(ImGuiMouseButton_Left)) {
        ImGui::SetKeyboardFocusHere(-1);
    }
    const bool viewport_focused = ImGui::IsItemFocused();
''',
        "viewport keyboard focus")

    model_interaction = src / "UI/Layout/RenderPanel/DirectX/ModelView/Interaction/SkeletonCameraAndRender.inl"
    replace(model_interaction,
        '''    if (S.terrain_mode) {
        const float dt = ImGui::GetIO().DeltaTime;
        if (hovered || g_flycam.is_looking ||
            g_flycam.right_press_pending) {
            ::render_panel_handle_flycam(dt);
        }
    } else {
''',
        '''    if (S.terrain_mode || g_mp.no_tilt) {
        const float dt = ImGui::GetIO().DeltaTime;
        const bool fly_keys =
            (S.level_fly_navigation_enabled && (hovered || viewport_focused))
            || g_flycam.is_looking;
        if (hovered || viewport_focused || g_flycam.is_looking ||
            g_flycam.right_press_pending) {
            ::render_panel_handle_flycam(dt, fly_keys);
        }
        // F recentres the camera on the currently loaded scene.
        // In edit mode this shortcut is only enabled while looking with RMB.
        if (fly_keys && !ImGui::GetIO().WantTextInput &&
            !ImGui::GetIO().KeyCtrl && !ImGui::GetIO().KeyAlt &&
            ImGui::IsKeyPressed(ImGuiKey_F, false)) {
            const float saved_speed = g_flycam.move_speed;
            FlyCam_Reset(g_flycam,
                g_mp.center[0], g_mp.center[1], g_mp.center[2],
                std::max(1.0f, g_mp.radius));
            g_flycam.move_speed = saved_speed;
        }
    } else {
''',
        "level keyboard navigation + scene recenter")

    render = src / "UI/Layout/RenderPanel.cpp"
    replace(render,
        "void render_panel_handle_flycam(float dt);",
        "void render_panel_handle_flycam(float dt, bool allow_keyboard);",
        "flycam call signature in render panel")

    ui_main = src / "UI/UI_Main.cpp"
    replace(ui_main,
        '''static void handle_flycam_input(float dt) {
    ImGuiIO& io = ImGui::GetIO();
    const bool keys_ok =
        !LevelEdit::Enabled() || g_flycam.is_looking;
    bool w_pressed = keys_ok && ImGui::IsKeyDown(S.key_forward);
    bool s_pressed = keys_ok && ImGui::IsKeyDown(S.key_back);
    bool a_pressed = keys_ok && ImGui::IsKeyDown(S.key_left);
    bool d_pressed = keys_ok && ImGui::IsKeyDown(S.key_right);
    bool q_pressed = keys_ok && ImGui::IsKeyDown(S.key_down);
    bool e_pressed = keys_ok && ImGui::IsKeyDown(S.key_up);
''',
        '''static void handle_flycam_input(float dt, bool allow_keyboard) {
    ImGuiIO& io = ImGui::GetIO();
    // Never steal input while typing a filename, searching, rebinding, etc.
    const bool keys_ok = allow_keyboard && !io.WantTextInput &&
        S.capturing_key_id < 0 && !io.KeyCtrl && !io.KeyAlt &&
        !io.KeySuper;
    // W/A/S/D and arrows always have their familiar directions, regardless
    // of older builds' reversed default 'left'/'right' keybind labels.
    bool w_pressed = keys_ok && (ImGui::IsKeyDown(ImGuiKey_W) ||
                                 ImGui::IsKeyDown(ImGuiKey_UpArrow));
    bool s_pressed = keys_ok && (ImGui::IsKeyDown(ImGuiKey_S) ||
                                 ImGui::IsKeyDown(ImGuiKey_DownArrow));
    // Original FlyCam_Update uses 'a' for +right and 'd' for -right.
    bool a_pressed = keys_ok && (ImGui::IsKeyDown(ImGuiKey_D) ||
                                 ImGui::IsKeyDown(ImGuiKey_RightArrow));
    bool d_pressed = keys_ok && (ImGui::IsKeyDown(ImGuiKey_A) ||
                                 ImGui::IsKeyDown(ImGuiKey_LeftArrow));
    bool q_pressed = keys_ok && ImGui::IsKeyDown(ImGuiKey_Q);
    bool e_pressed = keys_ok && ImGui::IsKeyDown(ImGuiKey_E);
''',
        "scene movement WASD and arrow keys")

    replace(ui_main,
        '''    FlyCam_Update(g_flycam, dt, w_pressed, s_pressed, a_pressed, d_pressed, q_pressed, e_pressed, mouse_dx, mouse_dy);
}

void render_panel_handle_flycam(float dt) {
    handle_flycam_input(dt);
}''',
        '''    // Frame-rate-independent movement, without diagonal speed advantage.
    const int horizontal = int(a_pressed != d_pressed);
    const int forward = int(w_pressed != s_pressed);
    const int vertical = int(q_pressed != e_pressed);
    const int axes = horizontal + forward + vertical;
    float move_dt = std::clamp(dt, 0.0f, 0.05f);
    if (axes > 1)
        move_dt /= std::sqrt(static_cast<float>(axes));
    if (keys_ok && io.KeyShift) move_dt *= 4.0f;
    FlyCam_Update(g_flycam, move_dt, w_pressed, s_pressed,
                  a_pressed, d_pressed, q_pressed, e_pressed,
                  mouse_dx, mouse_dy);
}

void render_panel_handle_flycam(float dt, bool allow_keyboard) {
    handle_flycam_input(dt, allow_keyboard);
}''',
        "scene diagonal normalization and Shift sprint")

    overlay = src / "UI/Layout/RenderPanel/DirectX/ModelView/Controls/ViewportOverlays.inl"
    replace(overlay,
        '''    if (g_mp.no_tilt && LevelEdit::Enabled() && hovered &&
        !g_flycam.is_looking && !ImGui::GetIO().WantTextInput) {''',
        '''    if (g_mp.no_tilt && LevelEdit::Enabled() && hovered &&
        !S.level_fly_navigation_enabled &&
        !g_flycam.is_looking && !ImGui::GetIO().WantTextInput) {''',
        "avoid W/E gizmo shortcuts while navigating")

    replace(overlay,
        '''    dl->AddRectFilled(ImVec2(origin.x + 6, origin.y + 6),
                      ImVec2(origin.x + 196, origin.y + 70),
                      IM_COL32(20, 22, 28, 200), 4.0f);
    ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 12));
    ImGui::TextColored(ImVec4(1.0f, 0.9f, 0.5f, 1.0f), "Controls");
    ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 30));
    ImGui::TextDisabled("L-Drag  rotate");
    ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 46));
    ImGui::TextDisabled("Wheel  zoom  /  ESC  close");

    float next_overlay_y = origin.y + 76.0f;''',
        '''    const bool scene_navigation_controls = S.terrain_mode && g_mp.no_tilt;
    dl->AddRectFilled(ImVec2(origin.x + 6, origin.y + 6),
                      ImVec2(origin.x + (scene_navigation_controls ? 254 : 196),
                             origin.y + (scene_navigation_controls ? 145 : 70)),
                      IM_COL32(20, 22, 28, 200), 4.0f);
    ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 12));
    ImGui::TextColored(ImVec4(1.0f, 0.9f, 0.5f, 1.0f), "Controls");
    ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 30));
    ImGui::TextDisabled(scene_navigation_controls
        ? "WASD / arrows: move" : "L-Drag  rotate");
    ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 46));
    ImGui::TextDisabled(scene_navigation_controls
        ? "RMB: look | Q/E: down/up" : "Wheel  zoom  /  ESC  close");
    if (scene_navigation_controls) {
        ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 66));
        ImGui::Checkbox("Fly navigation##level_fly_mode",
                        &S.level_fly_navigation_enabled);
        ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 94));
        ImGui::SetNextItemWidth(145.0f);
        ImGui::SliderFloat("Speed##level_fly_speed", &g_flycam.move_speed,
                           0.1f, 5000.0f, "%.1f",
                           ImGuiSliderFlags_Logarithmic);
        ImGui::SetCursorScreenPos(ImVec2(origin.x + 14, origin.y + 122));
        ImGui::TextDisabled("Shift: boost  |  F: recenter");
    }

    float next_overlay_y = origin.y +
        (scene_navigation_controls ? 151.0f : 76.0f);''',
        "Unity-style in-scene navigation overlay")

    print("Unity-like fly navigation patch applied. Compile Windows x64 Release.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python enable_unity_flycam.py PATH_TO_BROWSER_SOURCE")
    main(Path(sys.argv[1]))
