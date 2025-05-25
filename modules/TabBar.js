// ./modules/TabBar.js
import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TabDragger } from './TabDragger.js';

const TAB_INTERNAL_NON_LABEL_WIDTH = 50;

export class TabBar extends St.BoxLayout {
    static { GObject.registerClass(this); }

    constructor(zoneId, onTabClicked, settingsMgr) {
        super({
            style_class: 'zone-tab-bar',
            vertical: false,
            x_expand: true,
            reactive: true,
        });
        this.show_on_add = false; // <--- KEY CHANGE: Children not shown automatically on add
        this._zoneId = zoneId;
        this._onTabClicked = onTabClicked;
        this._settingsMgr = settingsMgr;
        this._tabsData = [];
        this.visible = false;
        this._windowTracker = Shell.WindowTracker.get_default();
        this._tabDragger = new TabDragger(this, this._onTabClicked);
        this._needsLayoutUpdate = true;
        this._destroyed = false;

        this.connect('style-changed', () => {
            if (this._destroyed) return;
            this._needsLayoutUpdate = true;
            this.queue_relayout();
        });
    }

    vfunc_allocate(box) {
        super.vfunc_allocate(box);
        if (this._destroyed) return;
        if (this._needsLayoutUpdate || (this.visible && this.get_n_children() > 0)) {
            this._updateTabLayout(box);
            this._needsLayoutUpdate = false;
        }
    }
    
    requestLayoutUpdate(needsUpdate = true) {
        if (this._destroyed) return;
        this._needsLayoutUpdate = needsUpdate;
        if (needsUpdate) {
            this.queue_relayout();
        }
    }

    getTabActors() {
        if (this._destroyed) return [];
        return this._tabsData.map(td => td.actor);
    }

    hasWindow(win) {
        if (this._destroyed) return false;
        return this._tabsData.some(td => td.window === win);
    }

    _updateTabLayout(currentAllocationBox) {
        if (this._destroyed || !this.visible) return;
        const children = this.get_children().filter(c => c.style_class !== 'zone-tab-drag-slot' && c.visible); // Consider only visible children for active layout
        const numChildren = children.length;

        if (numChildren === 0 && !this.get_children().some(c => c.style_class === 'zone-tab-drag-slot' && c.visible)) {
            return;
        }

        const tabMinWidth = this._settingsMgr.getTabMinWidth();
        const tabMaxWidth = this._settingsMgr.getTabMaxWidth();
        const gapSpacing = this._settingsMgr.getTabSpacing();
        const tabCornerRadius = this._settingsMgr.getTabCornerRadius();

        const allocation = currentAllocationBox || this.get_allocation_box();
        if (!allocation || allocation.get_width() === 0) return; // Don't layout if tab bar has no allocation

        let contentAreaWidth = allocation.get_width();
        const themeNode = this.get_theme_node();
        if (themeNode) contentAreaWidth -= themeNode.get_horizontal_padding();
        
        const allLayoutChildren = this.get_children().filter(c => c.visible || c.style_class === 'zone-tab-drag-slot'); // Layout visible tabs + slot
        const numLayoutChildren = allLayoutChildren.length;
        const totalGapWidth = (numLayoutChildren > 1) ? (numLayoutChildren - 1) * gapSpacing : 0;
        let widthForTabs = contentAreaWidth - totalGapWidth;

        if (widthForTabs <= 0) {
            widthForTabs = (numChildren > 0 ? numChildren : (numLayoutChildren > 0 ? numLayoutChildren : 1)) * tabMinWidth;
        }

        let tabWidth;
        if (numChildren > 0) { // If there are actual tabs visible
            tabWidth = Math.floor(widthForTabs / numChildren);
        } else if (numLayoutChildren > 0) { // Only slot might be visible or considered
            tabWidth = Math.floor(widthForTabs / numLayoutChildren);
        } else {
            return;
        }
        tabWidth = Math.max(tabMinWidth, Math.min(tabWidth, tabMaxWidth));

        let remainder = (numChildren > 0) ? (widthForTabs - (tabWidth * numChildren)) : 0;
        if (remainder < 0) remainder = 0;

        let currentVisualChildIndex = 0;
        for (let i = 0; i < allLayoutChildren.length; i++) {
            const child = allLayoutChildren[i];
            // Skip if not the slot and not visible (though filter should handle this)
            if (child.style_class !== 'zone-tab-drag-slot' && !child.visible) continue;

            let currentWidth = tabWidth;

            if (remainder > 0 && child.style_class !== 'zone-tab-drag-slot') {
                currentWidth++; remainder--;
            }
            currentWidth = Math.max(tabMinWidth, Math.min(currentWidth, tabMaxWidth));

            child.set_width(currentWidth);
            child.set_style(`margin-left: ${currentVisualChildIndex === 0 ? 0 : gapSpacing}px; border-radius: ${tabCornerRadius}px ${tabCornerRadius}px 0 0;`);
            
            const tabData = this._tabsData.find(td => td.actor === child);
            if (tabData && tabData.labelActor) {
                const labelMax = currentWidth - TAB_INTERNAL_NON_LABEL_WIDTH;
                tabData.labelActor.set_style(`max-width: ${Math.max(0, labelMax)}px`);
            }
            currentVisualChildIndex++;
        }
    }

    addWindow(win) {
        if (this._destroyed || this._tabsData.some(td => td.window === win)) {
            if (!this._destroyed) this.highlightWindow(win);
            return;
        }

        const app = this._windowTracker.get_window_app(win);
        const { actor, labelActor } = this._buildTabActor(win, app);
        actor.hide(); // Explicitly hide the actor before adding

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._destroyed) {
                actor.destroy();
                return GLib.SOURCE_REMOVE;
            }

            const compositorPrivate = win.get_compositor_private?.();
            if (!compositorPrivate) {
                actor.destroy(); 
                return GLib.SOURCE_REMOVE;
            }
            
            this.add_child(actor); // Actor is added but remains hidden due to this.show_on_add = false and actor.hide()
            
            const unmanageId = win.connect('unmanaging', () => this.removeWindow(win));
            this._tabsData.push({ window: win, actor, labelActor, unmanageId });
            this._tabDragger.initPointerHandlers(actor, win);

            if (!this.visible && this._tabsData.length > 0) {
                this.visible = true; // Make TabBar container visible if it's the first tab
            }
            
            this._needsLayoutUpdate = true;
            this.queue_relayout(); // This will trigger allocation for the (still hidden) actor

            // Defer showing and interacting until after the layout pass
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (this._destroyed || actor.get_parent() !== this) {
                    // Actor might have been removed if window was closed very fast
                    return GLib.SOURCE_REMOVE;
                }
                
                actor.show(); // Now show the actor, it should be allocated
                this.highlightWindow(win); 
                this._onTabClicked(win); 

                if (actor.can_focus && actor.get_stage() && actor.get_paint_visibility()) {
                     actor.grab_key_focus();
                }
                return GLib.SOURCE_REMOVE;
            });
            
            return GLib.SOURCE_REMOVE;
        });
    }

    _onTabCloseRequested(window) {
        if (this._destroyed) return;
        window.delete(global.get_current_time());
    }

    removeWindow(win) {
        if (this._destroyed) return;
        const idx = this._tabsData.findIndex(td => td.window === win);
        if (idx < 0) return;

        const tabData = this._tabsData[idx];
        if (this._tabDragger.isDragging() && this._tabDragger.getDraggedActor() === tabData.actor) {
            this._tabDragger.cancelDrag(true);
        }

        if (tabData.unmanageId && tabData.window) {
            const compositorPrivate = tabData.window.get_compositor_private?.();
            if (compositorPrivate) {
                try {
                    tabData.window.disconnect(tabData.unmanageId);
                } catch (e) { /* console.error("TabBar: Error disconnecting unmanageId:", e); */ }
            }
        }
        tabData.unmanageId = 0;

        if (tabData.actor._pressTimeoutId) {
            GLib.Source.remove(tabData.actor._pressTimeoutId);
            tabData.actor._pressTimeoutId = 0;
        }
        tabData.actor._pressEventDetails = null;

        if (tabData.actor.get_parent() === this) {
            this.remove_child(tabData.actor);
        }
        tabData.actor.destroy();
        this._tabsData.splice(idx, 1);
        if (this._tabsData.length === 0) {
            this.visible = false;
        }
        this._needsLayoutUpdate = true;
        this.queue_relayout();
    }

    highlightWindow(win) {
        if (this._destroyed) return;
        this._tabsData.forEach(({ window: w, actor }) => {
            if (w === win) {
                actor.add_style_pseudo_class('active');
            } else {
                actor.remove_style_pseudo_class('active');
            }
        });
    }

    _buildTabActor(win, app) {
        const actor = new St.Button({
            style_class: 'zone-tab',
            reactive: true,
            can_focus: true,
        });
        // actor.hide(); // Not needed here, will be hidden before add_child in addWindow
        const box = new St.BoxLayout({
            vertical: false,
            style_class: 'zone-tab-content',
            x_expand: true
        });
        actor.set_child(box);

        if (app?.get_icon()) {
            box.add_child(new St.Icon({
                gicon: app.get_icon(),
                icon_size: this._settingsMgr.getTabIconSize(),
                style_class: 'zone-tab-app-icon'
            }));
        }
        const fs = this._settingsMgr.getTabFontSize();
        const title = this._makeLabelText(win, app);
        const labelActor = new St.Label({
            text: title,
            y_align: Clutter.ActorAlign.CENTER
        });
        labelActor.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        labelActor.set_style(`font-size:${fs}px;`);
        labelActor.x_expand = true;
        box.add_child(labelActor);

        const closeButton = new St.Button({
            style_class: 'zone-tab-close-button',
            can_focus: true,
            reactive: true,
        });
        closeButton.set_child(new St.Icon({
            icon_name: 'window-close-symbolic',
            icon_size: this._settingsMgr.getTabCloseButtonIconSize(),
        }));
        closeButton.connect('clicked', () => {
            this._onTabCloseRequested(win);
            return Clutter.EVENT_STOP;
        });
        box.add_child(closeButton);

        actor._tabWindow = win;
        actor._pressTimeoutId = 0; 

        return { actor, labelActor };
    }

    _makeLabelText(win, app) {
        if (app) return app.get_name() ||
            win.get_title() || 'Untitled';
        const c = win.get_wm_class();
        return c ? c.replace(/[-_.]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : win.get_title() || 'Untitled';
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        this._tabDragger.destroy(); 
        this._tabsData.forEach(({ unmanageId, window, actor }) => {
            if (unmanageId && window) {
                const compositorPrivate = window.get_compositor_private?.();
                if (compositorPrivate) {
                    try { window.disconnect(unmanageId); } catch (e) { /* log error */ }
                }
            }
            if (actor._pressTimeoutId) {
                GLib.Source.remove(actor._pressTimeoutId);
            }
        });
        this._tabsData = [];
        
        super.destroy();
    }

    refreshTabVisuals() {
        if (this._destroyed) return;
        this._tabsData.forEach(tabData => {
            const { actor, window } = tabData; 
            const labelActor = tabData.labelActor;
            const app = this._windowTracker.get_window_app(window);

            const box = actor.get_child();
            if (!box) return; 

            let appIconActor = null;
            let closeButtonActor = null;

            box.get_children().forEach(child => { 
                if (child instanceof St.Icon && child.style_class === 'zone-tab-app-icon') {
                    appIconActor = child;
                } else if (child instanceof St.Button && child.style_class === 'zone-tab-close-button') { 
                    closeButtonActor = child;
                }
            });

            if (appIconActor) box.remove_child(appIconActor);
            if (app?.get_icon()) {
                const newAppIcon = new St.Icon({
                    gicon: app.get_icon(),
                    icon_size: this._settingsMgr.getTabIconSize(),
                    style_class: 'zone-tab-app-icon'
                });
                if (labelActor) {
                    box.insert_child_below(newAppIcon, labelActor);
                } else { 
                    box.add_child(newAppIcon);
                }
            }

            if (labelActor) { 
                const fs = this._settingsMgr.getTabFontSize();
                labelActor.set_style(`font-size:${fs}px;`);
            }

            if (closeButtonActor) {
                const oldIcon = closeButtonActor.get_child();
                if (oldIcon) oldIcon.destroy();
                closeButtonActor.set_child(new St.Icon({
                    icon_name: 'window-close-symbolic',
                    icon_size: this._settingsMgr.getTabCloseButtonIconSize(),
                }));
            }
        });
        this._needsLayoutUpdate = true;
        this.queue_relayout();
    }
}
