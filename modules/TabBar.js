// modules/TabBar.js

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

export class TabBar extends St.BoxLayout {
    static {
        GObject.registerClass(this);
    }

    constructor(zoneId, onTabClicked) {
        super({
            style_class: 'zone-tab-bar',
            vertical: false,
            x_expand: true,
            y_expand: false,
            reactive: true,
        });

        this._zoneId = zoneId;
        this._onTabClicked = onTabClicked;
        this._tabs = [];        // holds { window, actor }
        this.visible = false;
        this.opacity = 255;
    }

    addWindow(window) {
        // Prevent duplicate tabs
        if (this._tabs.some(t => t.window === window)) {
            this.highlightWindow(window);
            return;
        }

        const title = window.get_title();
        const tab = new St.Button({
            style_class: 'zone-tab',
            label: title,
            reactive: true,
            x_expand: false,
            y_expand: false,
        });

        tab.connect('button-press-event', (actor, event) => {
            this._onTabClicked(window);
            return Clutter.EVENT_STOP;
        });

        this.add_child(tab);
        this._tabs.push({ window, actor: tab });
        this.visible = true;
        this.highlightWindow(window);
    }

    removeWindow(window) {
        const idx = this._tabs.findIndex(t => t.window === window);
        if (idx >= 0) {
            const { actor } = this._tabs[idx];
            this.remove_child(actor);
            this._tabs.splice(idx, 1);
        }
        if (this._tabs.length === 0) {
            this.visible = false;
        }
    }

    highlightWindow(window) {
        this._tabs.forEach(({ window: w, actor }) => {
            if (w === window) {
                actor.add_style_pseudo_class('active');
            } else {
                actor.remove_style_pseudo_class('active');
            }
        });
    }

    destroy() {
        if (this.get_parent()) {
            this.get_parent().remove_child(this);
        }
        super.destroy();
    }
}

