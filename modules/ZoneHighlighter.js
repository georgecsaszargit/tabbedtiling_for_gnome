import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const log = (msg) => console.log(`[AutoZoner.ZoneHighlighter] ${msg}`);

export class ZoneHighlighter extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            style_class: 'zone-highlight',
            visible: false,
            reactive: false,
            x_expand: false,
            y_expand: false,
            opacity: 0,
        });
        Main.uiGroup.add_child(this);
        // Ensure it's above most other things but below popups/menus if possible
        // This might need adjustment based on other UI elements.
        // Setting a high child index:
        if (Main.uiGroup.get_children().length > 1) {
             Main.uiGroup.set_child_above_sibling(this, Main.uiGroup.get_last_child());
        }
        this._isShowing = false; // Internal state to track intent
        log("Created and added to uiGroup.");
    }

    showAt(rect) {
        this.set_position(Math.round(rect.x), Math.round(rect.y));
        this.set_size(Math.round(rect.width), Math.round(rect.height));

        this._isShowing = true;
        if (!this.visible) {
            this.set_opacity(0); // Ensure opacity is 0 before showing for fade-in
            super.show(); // Use super.show() to bypass our custom hide logic
        }

        this.remove_all_transitions(); // Clear any ongoing transitions
        this.ease({
            opacity: 255,
            duration: 100, // Short duration for responsiveness
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    hideNow() { // An immediate hide without fade
        this._isShowing = false;
        this.remove_all_transitions();
        this.set_opacity(0);
        super.hide();
    }

    requestHide() { // Fade out hide
        this._isShowing = false;
        if (this.visible) {
            this.remove_all_transitions();
            this.ease({
                opacity: 0,
                duration: 150, // Slightly longer fade-out
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    // Only hide if we still intend to be hidden (i.e., no new showAt was called)
                    if (!this._isShowing && this.opacity === 0) {
                        super.hide();
                    }
                }
            });
        }
    }

    get isShowingIntent() { // Getter for external modules to check intent
        return this._isShowing;
    }


    destroy() {
        log("Destroying...");
        this.remove_all_transitions();
        if (this.get_parent()) {
            this.get_parent().remove_child(this);
        }
        super.destroy();
    }
}
