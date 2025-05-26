// ./modules/TabBar.js
import St from 'gi://St';
import GObject from 'gi://GObject';
// [cite: 703]
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Gio from 'gi://Gio';
// [cite: 704] // Import Gio for FileIcon
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { TabDragger } from './TabDragger.js';
import {WindowManager} from "./WindowManager.js";
// [cite: 705]
const TAB_INTERNAL_NON_LABEL_WIDTH = 50;
export class TabBar extends St.BoxLayout {
    static { GObject.registerClass(this);
    // [cite: 706]
    }

    constructor(zoneId, zoneDef, onTabClicked, settingsMgr, windowManager) {
        super({
            style_class: 'zone-tab-bar',
            vertical: false,
            x_expand: true,
            reactive: true,
        });
        // [cite: 707]
        this.show_on_add = false;
        this._zoneId = zoneId;
        this._zoneDef = zoneDef;
        this._onTabClicked = onTabClicked;
        this._settingsMgr = settingsMgr;
        this._windowManager = windowManager;
        // [cite: 708]
        this._tabsData = [];
        this.visible = false;
        this._windowTracker = Shell.WindowTracker.get_default();
        this._tabDragger = new TabDragger(this, this._onTabClicked);
        this._needsLayoutUpdate = true;
        this._destroyed = false;
        // [cite: 709]
        this._splitButton = null;
        this._splitButtonIcon = null;


        this.connect('style-changed', () => {
            if (this._destroyed) return;
            this._needsLayoutUpdate = true;
            this.queue_relayout();
        });
        // [cite: 710]
        this._addSplitButton();
    }

    vfunc_allocate(box) {
        super.vfunc_allocate(box);
        if (this._destroyed) return;
        // [cite: 711]
        if (this._needsLayoutUpdate || (this.visible && this.get_n_children() > 0)) {
            this._updateTabLayout(box);
            // [cite: 712]
            this._needsLayoutUpdate = false;
        }
    }

    requestLayoutUpdate(needsUpdate = true) {
        if (this._destroyed) return;
        // [cite: 713]
        this._needsLayoutUpdate = needsUpdate;
        if (needsUpdate) {
            this.queue_relayout();
            // [cite: 714]
        }
    }

    _updateSplitButtonIcon() {
        if (!this._splitButtonIcon || !this._settingsMgr || !this._zoneDef) return;
        // [cite: 715]
        const extPath = this._settingsMgr.getExtensionPath();
        if (!extPath) {
            console.error("[AutoZoner.TabBar] Extension path not available for custom icons.");
            // [cite: 716] // Fallback to symbolic icons if path isn't found for some reason
            this._splitButtonIcon.set_icon_name(this._zoneDef.isSplitParent ? 'view-unite-symbolic' : 'view-split-horizontal-symbolic');
            // [cite: 717]
            return;
        }

        let iconFileName;
        // [cite: 718]
        if (this._zoneDef.isSplitParent) { // Zone is currently split, button action is to merge/unsplit
            iconFileName = 'full.png';
            // [cite: 719]
        } else { // Zone is not split, button action is to split
            iconFileName = 'split.png';
            // [cite: 720]
        }

        try {
            const iconFile = Gio.File.new_for_path(GLib.build_filenamev([extPath, 'images', iconFileName]));
            // [cite: 721]
            if (iconFile.query_exists(null)) {
                this._splitButtonIcon.set_gicon(new Gio.FileIcon({ file: iconFile }));
                // [cite: 722]
            } else {
                console.warn(`[AutoZoner.TabBar] Custom icon not found: ${iconFileName}. Falling back to symbolic icon.`);
                // [cite: 723]
                this._splitButtonIcon.set_icon_name(this._zoneDef.isSplitParent ? 'view-unite-symbolic' : 'view-split-horizontal-symbolic');
            }
        } catch (e) {
            console.error(`[AutoZoner.TabBar] Error loading custom icon ${iconFileName}: ${e}. Falling back.`);
            // [cite: 724]
            this._splitButtonIcon.set_icon_name(this._zoneDef.isSplitParent ? 'view-unite-symbolic' : 'view-split-horizontal-symbolic');
        }
    }

    _addSplitButton() {
        if (this._destroyed || this._zoneDef.isSplitChild) {
            return;
            // [cite: 725]
        }

        this._splitButton = new St.Button({
            style_class: 'zone-tab-bar-split-button',
            can_focus: true,
            reactive: true,
        });
        // [cite: 726]
        this._splitButtonIcon = new St.Icon({
            // Icon size can be set here if desired, e.g., icon_size: 16,
            // or rely on stylesheet / natural size of PNG
            style_class: 'system-status-icon', // Keeps some consistency, or use a custom class
        });
        // [cite: 727]
        this._updateSplitButtonIcon(); // Set initial icon using custom PNGs
        this._splitButton.set_child(this._splitButtonIcon);
        // [cite: 728]
        this._splitButton.connect('clicked', () => {
            if (this._windowManager && typeof this._windowManager.toggleZoneSplit === 'function') {
                this._windowManager.toggleZoneSplit(this._zoneId);
            }
        });
        // [cite: 729]
        this.add_child(this._splitButton);
    }

    getTabActors() {
        if (this._destroyed) return [];
        // [cite: 730]
        return this._tabsData.map(td => td.actor);
    }

    hasWindow(win) {
        if (this._destroyed) return false;
        // [cite: 731]
        return this._tabsData.some(td => td.window === win);
    }

    _updateTabLayout(currentAllocationBox) {
        if (this._destroyed || !this.visible) return;
        // [cite: 732]
        const themeNode = this.get_theme_node();
        const allocation = currentAllocationBox || this.get_allocation_box();
        if (!allocation || allocation.get_width() === 0 || !themeNode) return;
        // [cite: 733] // Children that will flow normally (tabs and drag slot)
        const flowChildren = this.get_children().filter(c =>
            c !== this._splitButton && // Exclude split button from this flow
            (c.visible || c.style_class === 'zone-tab-drag-slot')
        );
        // [cite: 734]
        const numFlowChildren = flowChildren.length;

        if (numFlowChildren === 0 && (!this._splitButton || !this._splitButton.visible)) {
            return;
            // [cite: 735] // Nothing to lay out
        }

        const tabMinWidth = this._settingsMgr.getTabMinWidth();
        // [cite: 736]
        const tabMaxWidth = this._settingsMgr.getTabMaxWidth();
        const gapSpacing = this._settingsMgr.getTabSpacing(); // Fetches the configured gap size
        const tabCornerRadius = this._settingsMgr.getTabCornerRadius();
        // [cite: 737] // Calculate width available for flowChildren content and their CSS margins
        let availableWidth = allocation.get_width() - themeNode.get_horizontal_padding();
        // [cite: 738]
        let splitButtonReservation = 0;
        if (this._splitButton && this._splitButton.visible) {
            splitButtonReservation = this._splitButton.get_preferred_width(-1)[1];
            // [cite: 739]
            if (numFlowChildren > 0) { // If there are tabs, also reserve space for one gap before the button
                splitButtonReservation += gapSpacing;
                // [cite: 740]
            }
        }
        availableWidth -= splitButtonReservation;
        // [cite: 741] // Calculate the total width that will be consumed by margins between flowChildren
        let totalMarginWidth = 0;
        // [cite: 742]
        if (numFlowChildren > 1) {
            totalMarginWidth = (numFlowChildren - 1) * gapSpacing;
            // [cite: 743]
        }

        // This is the width purely for the content of the flowChildren themselves
        let netWidthForFlowChildrenContent = availableWidth - totalMarginWidth;
        // [cite: 744]
        if (netWidthForFlowChildrenContent <= 0 && numFlowChildren > 0) {
            // Fallback if calculated space is too small (e.g. due to large gaps and many tabs)
            netWidthForFlowChildrenContent = numFlowChildren * tabMinWidth;
            // [cite: 745]
        }

        let childBaseWidth = tabMinWidth;
        // [cite: 746]
        if (numFlowChildren > 0) {
            childBaseWidth = Math.floor(netWidthForFlowChildrenContent / numFlowChildren);
            // [cite: 747]
        }
        // Ensure base width is within defined min/max
        childBaseWidth = Math.max(tabMinWidth, Math.min(childBaseWidth, tabMaxWidth));
        // [cite: 748]
        let remainderWidth = 0;
        if (numFlowChildren > 0) {
            remainderWidth = netWidthForFlowChildrenContent - (childBaseWidth * numFlowChildren);
            // [cite: 749]
            if (remainderWidth < 0) remainderWidth = 0;
        }

        for (let i = 0; i < flowChildren.length; i++) {
            const child = flowChildren[i];
            // [cite: 750]
            let currentChildActualWidth = childBaseWidth;

            if (remainderWidth > 0) { // Distribute any remaining width
                currentChildActualWidth++;
                // [cite: 751]
                remainderWidth--;
            }
            // Final check on width (should already be constrained but good for safety)
            currentChildActualWidth = Math.max(tabMinWidth, Math.min(currentChildActualWidth, tabMaxWidth));
            // [cite: 752]
            child.set_width(currentChildActualWidth);

            let dynamicStyle = `border-radius: ${tabCornerRadius}px ${tabCornerRadius}px 0 0;`;
            if (i > 0) { // Add margin-left for children after the first to create spacing
                dynamicStyle += ` margin-left: ${gapSpacing}px;`;
                // [cite: 753]
            }
            child.set_style(dynamicStyle);
            // [cite: 754] // We are NOT using child.set_x() here for flowChildren.
            // St.BoxLayout will use the margin-left and its own packing logic.
            // [cite: 755] // We still vertically center them.
            child.set_y(Math.floor((allocation.get_height() - child.get_height()) / 2));

            const tabData = this._tabsData.find(td => td.actor === child);
            // [cite: 756]
            if (tabData && tabData.labelActor) {
                const labelMax = currentChildActualWidth - TAB_INTERNAL_NON_LABEL_WIDTH;
                // [cite: 757] // TAB_INTERNAL_NON_LABEL_WIDTH = 50 [cite: 700]
                tabData.labelActor.set_style(`max-width: ${Math.max(0, labelMax)}px`);
                // [cite: 758]
            }
        }

        // Position the split button manually from the right, as it's not part of the flow
        if (this._splitButton && this._splitButton.visible) {
            const buttonNaturalWidth = this._splitButton.get_preferred_width(-1)[1];
            // [cite: 759]
            this._splitButton.set_width(buttonNaturalWidth);
            // Position from the right edge of the TabBar's allocation
            const buttonX = allocation.get_width() - themeNode.get_padding(St.Side.RIGHT) - buttonNaturalWidth;
            // [cite: 760]
            this._splitButton.set_x(buttonX); // Manual X position
            this._splitButton.set_y(Math.floor((allocation.get_height() - this._splitButton.get_height()) / 2));
            // [cite: 761] // Vertical center
        }
    }

    addWindow(win) {
        if (this._destroyed || this._tabsData.some(td => td.window === win)) {
            if (!this._destroyed) this.highlightWindow(win);
            // [cite: 762]
            return;
        }

        const app = this._windowTracker.get_window_app(win);
        // [cite: 763]
        const { actor, labelActor } = this._buildTabActor(win, app);
        actor.hide();

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._destroyed) {
                actor.destroy();
                return GLib.SOURCE_REMOVE;
            }

            const compositorPrivate =
            // [cite: 764]
                 win.get_compositor_private?.();
            if (!compositorPrivate) {
                actor.destroy();
                return GLib.SOURCE_REMOVE;
            }

            if (this._splitButton && this._splitButton.get_parent() === this) {
            // [cite: 765]
               this.insert_child_below(actor, this._splitButton);
            } else {
                this.add_child(actor);
            }

            const unmanageId = win.connect('unmanaging', () => this.removeWindow(win));
            // [cite: 766]
            this._tabsData.push({ window: win, actor, labelActor, unmanageId });
            this._tabDragger.initPointerHandlers(actor, win);

            if (!this.visible && this._tabsData.length > 0) {
                this.visible = true;
            }

            this._needsLayoutUpdate = true;
            // [cite: 767]
            this.queue_relayout();

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                if (this._destroyed || actor.get_parent() !== this) {
                    return GLib.SOURCE_REMOVE;
                }

                actor.show();
                // [cite: 768]
                this.highlightWindow(win);
                this._onTabClicked(win);

                if (actor.can_focus && actor.get_stage() && actor.get_paint_visibility()) {
                     actor.grab_key_focus();
                }
                // [cite: 769]
                return GLib.SOURCE_REMOVE;
            });
            // [cite: 770]
            return GLib.SOURCE_REMOVE;
        });
    }

    _onTabCloseRequested(window) {
        if (this._destroyed) return;
        window.delete(global.get_current_time());
        // [cite: 771]
    }

    removeWindow(win) {
        if (this._destroyed) return;
        // [cite: 772]
        const idx = this._tabsData.findIndex(td => td.window === win);
        if (idx < 0) return;

        const tabData = this._tabsData[idx];
        // [cite: 773]
        if (this._tabDragger.isDragging() && this._tabDragger.getDraggedActor() === tabData.actor) {
            this._tabDragger.cancelDrag(true);
            // [cite: 774]
        }

        if (tabData.unmanageId && tabData.window) {
            const compositorPrivate = tabData.window.get_compositor_private?.();
            // [cite: 775]
            if (compositorPrivate) {
                try {
                    tabData.window.disconnect(tabData.unmanageId);
                    // [cite: 776]
                } catch (e) {
                }
            }
        }
        tabData.unmanageId = 0;
        // [cite: 777]
        if (tabData.actor._pressTimeoutId) {
            GLib.Source.remove(tabData.actor._pressTimeoutId);
            tabData.actor._pressTimeoutId = 0;
            // [cite: 778]
        }
        tabData.actor._pressEventDetails = null;
        // [cite: 779]
        if (tabData.actor.get_parent() === this) {
            this.remove_child(tabData.actor);
            // [cite: 780]
        }
        tabData.actor.destroy();
        this._tabsData.splice(idx, 1);
        // [cite: 781]
        if (this._tabsData.length === 0 && (!this._splitButton || !this._splitButton.visible)) {
            this.visible = false;
            // [cite: 782]
        } else if (this._tabsData.length === 0 && this._splitButton && this._splitButton.visible) {
            this.visible = true;
            // [cite: 783]
        }
        this._needsLayoutUpdate = true;
        this.queue_relayout();
        // [cite: 784]
    }

    highlightWindow(win) {
        if (this._destroyed) return;
        // [cite: 785]
        this._tabsData.forEach(({ window: w, actor }) => {
            if (w === win) {
                actor.add_style_pseudo_class('active');
            } else {
                actor.remove_style_pseudo_class('active');
            }
        });
        // [cite: 786]
    }

    _buildTabActor(win, app) {
        const actor = new St.Button({
            style_class: 'zone-tab',
            reactive: true,
            can_focus: true,
        });
        // [cite: 787]
        const box = new St.BoxLayout({
            vertical: false,
            style_class: 'zone-tab-content',
            x_expand: true
        });
        // [cite: 788]
        actor.set_child(box);

        if (app?.get_icon()) {
            box.add_child(new St.Icon({
                gicon: app.get_icon(),
                icon_size: this._settingsMgr.getTabIconSize(),
                style_class: 'zone-tab-app-icon'
            }));
            // [cite: 789]
        }
        const fs = this._settingsMgr.getTabFontSize();
        const title = this._makeLabelText(win, app); // Uses the modified _makeLabelText
        // [cite: 790]
        const labelActor = new St.Label({
            text: title,
            y_align: Clutter.ActorAlign.CENTER
        });
        // [cite: 791]
        labelActor.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        labelActor.set_style(`font-size:${fs}px;`);
        labelActor.x_expand = true;
        box.add_child(labelActor);

        const closeButton = new St.Button({
            style_class: 'zone-tab-close-button',
            can_focus: true,
            reactive: true,
        });
        // [cite: 792]
        closeButton.set_child(new St.Icon({
            icon_name: 'window-close-symbolic',
            icon_size: this._settingsMgr.getTabCloseButtonIconSize(),
        }));
        // [cite: 793]
        closeButton.connect('clicked', () => {
            this._onTabCloseRequested(win);
            return Clutter.EVENT_STOP;
        });
        // [cite: 794]
        box.add_child(closeButton);

        actor._tabWindow = win;
        actor._pressTimeoutId = 0;

        return { actor, labelActor };
        // [cite: 795]
    }

    // MODIFIED METHOD
    _makeLabelText(win, app) {
        const appNameExceptions = this._settingsMgr.getAppNameExceptions();
        let appName = app.get_name();
        let useWindowTitle = false;
		
        if (app) {
            let appID = app.get_id();
            if (appID && appNameExceptions.includes(appID.toLowerCase())) {
                useWindowTitle = true;
            }
        } 
        
        if (useWindowTitle) {
            //const windowTitle = win.get_title();
            const windowTitle = win.get_title();
            // Return window title, fallback to appName (if available), then to 'Untitled'
            return win.get_title().split(" ")[0] || appName || win.get_wm_class() || 'Untitled';
        }

        // Original logic if not in exceptions or no app/wmClass
        if (appName) return appName || win.get_title() || 'Untitled'; // [cite: 796]
        const c = win.get_wm_class(); // [cite: 796]
        return c ? c.replace(/[-_.]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : win.get_title() || 'Untitled'; // [cite: 797]
    }


    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        // [cite: 798]
        if (this._splitButton) {
            this._splitButton.destroy();
            this._splitButton = null;
            // [cite: 799]
            this._splitButtonIcon = null;
        }
        this._tabDragger.destroy();
        // [cite: 800]
        this._tabsData.forEach(({ unmanageId, window, actor }) => {
            if (unmanageId && window) {
                const compositorPrivate = window.get_compositor_private?.();
                if (compositorPrivate) {
                    try { window.disconnect(unmanageId); } catch (e) { /* log error */ }
                    // [cite: 801]
                }
            }
            if (actor._pressTimeoutId) {
                GLib.Source.remove(actor._pressTimeoutId);
            }
        });
        // [cite: 802]
        this._tabsData = [];

        super.destroy();
    }

    refreshTabVisuals() {
        if (this._destroyed) return;
        // [cite: 803]
        this._tabsData.forEach(tabData => {
            const { actor, window } = tabData;
            const labelActor = tabData.labelActor;
            const app = this._windowTracker.get_window_app(window);

            const box = actor.get_child();
            if (!box) return;

            // [cite: 804]
            let appIconActor = null;
            let closeButtonActor = null;

            box.get_children().forEach(child => {
                if (child instanceof St.Icon && child.style_class === 'zone-tab-app-icon') {
                    appIconActor = child;
                }
                // [cite: 805]
                else if (child instanceof St.Button && child.style_class === 'zone-tab-close-button') {
                    closeButtonActor = child;
                }
            });

            if (appIconActor) box.remove_child(appIconActor);
            if (app?.get_icon()) {
            // [cite: 806]
                const newAppIcon = new St.Icon({
                    gicon: app.get_icon(),
                    icon_size: this._settingsMgr.getTabIconSize(),
                    style_class: 'zone-tab-app-icon'
                });
                // [cite: 807]
                if (labelActor) {
                    box.insert_child_below(newAppIcon, labelActor);
                    // [cite: 808]
                } else {
                    box.add_child(newAppIcon);
                    // [cite: 809]
                }
            }

            if (labelActor) {
                const fs = this._settingsMgr.getTabFontSize();
                // [cite: 810]
                // Update label text in case window title or app name changed or exceptions apply differently
                labelActor.set_text(this._makeLabelText(window, app));
                labelActor.set_style(`font-size:${fs}px;`);
            }

            if (closeButtonActor) {
                const oldIcon = closeButtonActor.get_child();
                // [cite: 811]
                if (oldIcon) oldIcon.destroy();
                closeButtonActor.set_child(new St.Icon({
                    icon_name: 'window-close-symbolic',
                    icon_size: this._settingsMgr.getTabCloseButtonIconSize(),
                }));
                // [cite: 812]
            }
        });

        this._updateSplitButtonIcon();

        this._needsLayoutUpdate = true;
        this.queue_relayout();
        // [cite: 813]
    }
}
