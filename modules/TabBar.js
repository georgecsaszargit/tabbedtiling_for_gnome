// ./modules/TabBar.js
import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TabDragger } from './TabDragger.js';
import {WindowManager} from "./WindowManager.js";

const TAB_INTERNAL_NON_LABEL_WIDTH = 50;
export class TabBar extends St.BoxLayout {
    static { GObject.registerClass(this);
    }

    constructor(zoneId, zoneDef, onTabClicked, settingsMgr, windowManager) {
        super({
            style_class: 'zone-tab-bar',
            vertical: false,
            x_expand: true,
            reactive: true,
        });

        this.show_on_add = false;
        this._zoneId = zoneId;
        this._zoneDef = zoneDef;
        this._onTabClicked = onTabClicked;
        this._settingsMgr = settingsMgr;
        this._windowManager = windowManager;
        this._tabsData = [];
        this.visible = false;
        this._windowTracker = Shell.WindowTracker.get_default();
        this._tabDragger = new TabDragger(this, this._onTabClicked);
        this._needsLayoutUpdate = true;
        this._destroyed = false;
        this._splitButton = null;
        this._splitButtonIcon = null;


        this.connect('style-changed', () => {
            if (this._destroyed) return;
            this._needsLayoutUpdate = true;
            this.queue_relayout();
        });
        this._addSplitButton();
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

    _updateSplitButtonIcon() {
        if (!this._splitButtonIcon || !this._settingsMgr || !this._zoneDef) return;
        const extPath = this._settingsMgr.getExtensionPath();
        if (!extPath) {
            console.error("[AutoZoner.TabBar] Extension path not available for custom icons.");
            this._splitButtonIcon.set_icon_name(this._zoneDef.isSplitParent ? 'view-unite-symbolic' : 'view-split-horizontal-symbolic');
            return;
        }

        let iconFileName;
        if (this._zoneDef.isSplitParent) { // Zone is currently split, button action is to merge/unsplit
            iconFileName = 'full.png';
        } else { // Zone is not split, button action is to split
            iconFileName = 'split.png';
        }

        try {
            const iconFile = Gio.File.new_for_path(GLib.build_filenamev([extPath, 'images', iconFileName]));
            if (iconFile.query_exists(null)) {
                this._splitButtonIcon.set_gicon(new Gio.FileIcon({ file: iconFile }));
            } else {
                console.warn(`[AutoZoner.TabBar] Custom icon not found: ${iconFileName}. Falling back to symbolic icon.`);
                this._splitButtonIcon.set_icon_name(this._zoneDef.isSplitParent ? 'view-unite-symbolic' : 'view-split-horizontal-symbolic');
            }
        } catch (e) {
            console.error(`[AutoZoner.TabBar] Error loading custom icon ${iconFileName}: ${e}. Falling back.`);
            this._splitButtonIcon.set_icon_name(this._zoneDef.isSplitParent ? 'view-unite-symbolic' : 'view-split-horizontal-symbolic');
        }
    }

    _addSplitButton() {
        if (this._destroyed || this._zoneDef.isSplitChild) {
            return;
        }

        this._splitButton = new St.Button({
            style_class: 'zone-tab-bar-split-button',
            can_focus: true,
            reactive: true,
        });
        this._splitButtonIcon = new St.Icon({
            style_class: 'system-status-icon', // Keeps some consistency, or use a custom class
        });
        this._updateSplitButtonIcon(); // Set initial icon using custom PNGs
        this._splitButton.set_child(this._splitButtonIcon);
        this._splitButton.connect('clicked', () => {
            if (this._windowManager && typeof this._windowManager.toggleZoneSplit === 'function') {
                this._windowManager.toggleZoneSplit(this._zoneId);
            }
        });
        this.add_child(this._splitButton);
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
        const themeNode = this.get_theme_node();
        const allocation = currentAllocationBox || this.get_allocation_box();
        if (!allocation || allocation.get_width() === 0 || !themeNode) return;
        const flowChildren = this.get_children().filter(c =>
            c !== this._splitButton && // Exclude split button from this flow
            (c.visible || c.style_class === 'zone-tab-drag-slot')
        );
        const numFlowChildren = flowChildren.length;

        if (numFlowChildren === 0 && (!this._splitButton || !this._splitButton.visible)) {
            return;
        }

        const tabMinWidth = this._settingsMgr.getTabMinWidth();
        const tabMaxWidth = this._settingsMgr.getTabMaxWidth();
        const gapSpacing = this._settingsMgr.getTabSpacing(); // Fetches the configured gap size
        const tabCornerRadius = this._settingsMgr.getTabCornerRadius();
        let availableWidth = allocation.get_width() - themeNode.get_horizontal_padding();
        let splitButtonReservation = 0;
        if (this._splitButton && this._splitButton.visible) {
            splitButtonReservation = this._splitButton.get_preferred_width(-1)[1];
            if (numFlowChildren > 0) { // If there are tabs, also reserve space for one gap before the button
                splitButtonReservation += gapSpacing;
            }
        }
        availableWidth -= splitButtonReservation;
        let totalMarginWidth = 0;
        if (numFlowChildren > 1) {
            totalMarginWidth = (numFlowChildren - 1) * gapSpacing;
        }

        // This is the width purely for the content of the flowChildren themselves
        let netWidthForFlowChildrenContent = availableWidth - totalMarginWidth;
        if (netWidthForFlowChildrenContent <= 0 && numFlowChildren > 0) {
            // Fallback if calculated space is too small (e.g. due to large gaps and many tabs)
            netWidthForFlowChildrenContent = numFlowChildren * tabMinWidth;
        }

        let childBaseWidth = tabMinWidth;
        if (numFlowChildren > 0) {
            childBaseWidth = Math.floor(netWidthForFlowChildrenContent / numFlowChildren);
        }
        // Ensure base width is within defined min/max
        childBaseWidth = Math.max(tabMinWidth, Math.min(childBaseWidth, tabMaxWidth));
        let remainderWidth = 0;
        if (numFlowChildren > 0) {
            remainderWidth = netWidthForFlowChildrenContent - (childBaseWidth * numFlowChildren);
            if (remainderWidth < 0) remainderWidth = 0;
        }

        for (let i = 0; i < flowChildren.length; i++) {
            const child = flowChildren[i];
            let currentChildActualWidth = childBaseWidth;

            if (remainderWidth > 0) { // Distribute any remaining width
                currentChildActualWidth++;
                remainderWidth--;
            }
            // Final check on width (should already be constrained but good for safety)
            currentChildActualWidth = Math.max(tabMinWidth, Math.min(currentChildActualWidth, tabMaxWidth));
            child.set_width(currentChildActualWidth);

            let dynamicStyle = `border-radius: ${tabCornerRadius}px ${tabCornerRadius}px 0 0;`;
            if (i > 0) { // Add margin-left for children after the first to create spacing
                dynamicStyle += ` margin-left: ${gapSpacing}px;`;
            }
            child.set_style(dynamicStyle);
            // St.BoxLayout will use the margin-left and its own packing logic.
            child.set_y(Math.floor((allocation.get_height() - child.get_height()) / 2));

            const tabData = this._tabsData.find(td => td.actor === child);
            if (tabData && tabData.labelActor) {
                const labelMax = currentChildActualWidth - TAB_INTERNAL_NON_LABEL_WIDTH;
                tabData.labelActor.set_style(`max-width: ${Math.max(0, labelMax)}px`);
            }
        }

        // Position the split button manually from the right, as it's not part of the flow
        if (this._splitButton && this._splitButton.visible) {
            const buttonNaturalWidth = this._splitButton.get_preferred_width(-1)[1];
            this._splitButton.set_width(buttonNaturalWidth);
            // Position from the right edge of the TabBar's allocation
            const buttonX = allocation.get_width() - themeNode.get_padding(St.Side.RIGHT) - buttonNaturalWidth;
            this._splitButton.set_x(buttonX); // Manual X position
            this._splitButton.set_y(Math.floor((allocation.get_height() - this._splitButton.get_height()) / 2));
        }
    }

    addWindow(win) {

        if (this._destroyed || this._tabsData.some(td => td.window === win)) {
            if (!this._destroyed) this.highlightWindow(win);
            return;
        }

        const app = this._windowTracker.get_window_app(win);
        const { actor, labelActor } = this._buildTabActor(win, app);
        actor.hide();

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._destroyed) {
                actor.destroy();
                return GLib.SOURCE_REMOVE;
            }

            const compositorPrivate =
                 win.get_compositor_private?.();
            if (!compositorPrivate) {
                actor.destroy();
                return GLib.SOURCE_REMOVE;
            }

            if (this._splitButton && this._splitButton.get_parent() === this) {
               this.insert_child_below(actor, this._splitButton);
            } else {
                this.add_child(actor);
            }

            const unmanageId = win.connect('unmanaging', () => this.removeWindow(win));
            this._tabsData.push({ window: win, actor, labelActor, unmanageId });

            this._tabDragger.initPointerHandlers(actor, win);

            if (!this.visible && this._tabsData.length > 0) {
                this.visible = true;
            }

            this._needsLayoutUpdate = true;
            this.queue_relayout();

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (this._destroyed || actor.get_parent() !== this) {
                    return GLib.SOURCE_REMOVE;
                }

                actor.show();
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
                } catch (e) {
                }
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
        if (this._tabsData.length === 0 && (!this._splitButton || !this._splitButton.visible)) {
            this.visible = false;
        } else if (this._tabsData.length === 0 && this._splitButton && this._splitButton.visible) {
            this.visible = true;
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
        const title = this._makeLabelText(win, app); // Uses the modified _makeLabelText
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
        let useWindowTitle = false;
        let wordCount = 1; // Default word count
		
        if (app) {
            let appID = app.get_id();
            if (appID && this._settingsMgr.isAppNameException(appID)) {
                useWindowTitle = true;
                wordCount = this._settingsMgr.getAppNameExceptionWordCount(appID) || 1;
            }
        } 
        
        if (useWindowTitle) {
            const windowTitle = win.get_title();
            if (windowTitle) {
                // Take the specified number of words from the window title
                const words = windowTitle.split(" ");
                const selectedWords = words.slice(0, wordCount).join(" ");
                return selectedWords || app?.get_name() || win.get_wm_class() || 'Untitled';
            }
            // Fallback if no window title
            return app?.get_name() || win.get_wm_class() || 'Untitled';
        }

        // Original logic if not in exceptions or no app/wmClass
        if (app?.get_name()) return app.get_name();
        const c = win.get_wm_class();
        return c ? c.replace(/[-_.]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : win.get_title() || 'Untitled';
    }


    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        if (this._splitButton) {
            this._splitButton.destroy();
            this._splitButton = null;
            this._splitButtonIcon = null;
        }
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
                }
                else if (child instanceof St.Button && child.style_class === 'zone-tab-close-button') {
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
                // Update label text in case window title or app name changed or exceptions apply differently
                labelActor.set_text(this._makeLabelText(window, app));
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

        this._updateSplitButtonIcon();

        this._needsLayoutUpdate = true;
        this.queue_relayout();
    }
}
