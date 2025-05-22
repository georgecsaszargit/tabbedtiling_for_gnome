// modules/TabBar.js

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DRAG_THRESHOLD = 10;
const HOLD_TIMEOUT = 250;
const TAB_MIN_WIDTH = 60;
const TAB_MAX_WIDTH = 180;

export class TabBar extends St.BoxLayout {
    static { GObject.registerClass(this); }

    constructor(zoneId, onTabClicked, settingsMgr) {
        super({
            style_class: 'zone-tab-bar',
            vertical: false,
            x_expand: true,
            reactive: true,
        });
        // SET YOUR DESIRED GAP HERE:
        this.spacing = 5; // Example: 5px gap. Change this to your desired value.

        this._zoneId = zoneId;
        this._onTabClicked = onTabClicked;
        this._settingsMgr = settingsMgr;
        this._tabsData = [];

        this.visible = false;
        this._windowTracker = Shell.WindowTracker.get_default();

        this._pressTimeoutId = 0;
        this._dragInfo = null;
        this._needsLayoutUpdate = true;

        this.connect('style-changed', () => {
            this._needsLayoutUpdate = true;
            this.queue_relayout();
        });
    }

    vfunc_allocate(box, flags) {
        super.vfunc_allocate(box);

        if (this._needsLayoutUpdate || (this.visible && this.get_n_children() > 0)) {
            this._updateTabLayout(box);
            this._needsLayoutUpdate = false;
        }
    }

    _updateTabLayout(currentAllocationBox) {
        if (!this.visible) {
            return;
        }
        
        const children = this.get_children();
        const numChildren = children.length;

        if (numChildren === 0) {
            return;
        }

        const allocation = currentAllocationBox || this.get_allocation_box();
        let contentAreaWidth = allocation.x2 - allocation.x1; // Start with full allocated width
        
        // CRITICAL FIX: Account for the TabBar's own padding.
        const themeNode = this.get_theme_node();
        if (themeNode) {
            contentAreaWidth -= themeNode.get_horizontal_padding(); // Subtracts left+right padding
        }
        
        const totalSpacingWidth = (numChildren > 1) ? (numChildren - 1) * this.spacing : 0;
        let widthAvailableForTabs = contentAreaWidth - totalSpacingWidth;

        if (widthAvailableForTabs <= 0) { 
            widthAvailableForTabs = numChildren * TAB_MIN_WIDTH;
        }

        let tabWidth = Math.floor(widthAvailableForTabs / numChildren);
        tabWidth = Math.max(TAB_MIN_WIDTH, Math.min(tabWidth, TAB_MAX_WIDTH));

        let remainder = widthAvailableForTabs - (tabWidth * numChildren);
        if (remainder < 0) remainder = 0; 

        for (let i = 0; i < numChildren; i++) {
            const child = children[i];
            let currentTabWidth = tabWidth;
            if (remainder > 0) {
                currentTabWidth++;
                remainder--;
            }
            currentTabWidth = Math.max(TAB_MIN_WIDTH, Math.min(currentTabWidth, TAB_MAX_WIDTH));
            child.set_width(currentTabWidth);

            const tabData = this._tabsData.find(td => td.actor === child);
            if (tabData && tabData.labelActor) {
                 const internalNonLabelWidth = 25; 
                 let labelMaxWidth = currentTabWidth - internalNonLabelWidth;
                 if (labelMaxWidth < 0) labelMaxWidth = 0;
                 tabData.labelActor.set_style(`max-width: ${labelMaxWidth}px`);
            }
        }
    }

    addWindow(win) {
        if (this._tabsData.some(td => td.window === win)) {
            this.highlightWindow(win);
            return;
        }

        const app = this._windowTracker.get_window_app(win);
        const { actor, labelActor } = this._buildTabActor(win, app);

        this._initPointerHandlers(actor, win);

        const unmanageId = win.connect('unmanaging', () => this.removeWindow(win));
        this.add_child(actor);
        this._tabsData.push({ window: win, actor, labelActor, unmanageId });

        if (!this.visible) this.visible = true;
        
        this.highlightWindow(win);
        this._needsLayoutUpdate = true;
        this.queue_relayout();
    }

    removeWindow(win) {
        const idx = this._tabsData.findIndex(td => td.window === win);
        if (idx < 0) return;

        const tabData = this._tabsData[idx];
        if (this._dragInfo && this._dragInfo.draggedActor === tabData.actor) {
            this._cancelDrag(true);
        }
        
        if (tabData.unmanageId && tabData.window) {
            try {
                 tabData.window.disconnect(tabData.unmanageId);
            } catch (e) { 
                console.error("TabBar: Error disconnecting unmanageId on removeWindow:", e); 
            }
        }
        
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
                icon_size: 24,
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
        
        actor._tabWindow = win;

        return { actor, labelActor };
    }

    _makeLabelText(win, app) {
        if (app) return app.get_name() || win.get_title() || 'Untitled';
        const c = win.get_wm_class();
        return c ? c.replace(/[-_.]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : win.get_title() || 'Untitled';
    }

    _initPointerHandlers(actor, win) {
        actor._pressEventDetails = null; 
        actor._pressTimeoutId    = 0;

        actor.connect('button-press-event', (a, event) => {
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
            actor.grab_key_focus();

            if (actor._pressTimeoutId) GLib.Source.remove(actor._pressTimeoutId);
            
            const [pressEventX, pressEventY] = event.get_coords();
            actor._pressEventDetails = { time: event.get_time(), x: pressEventX, y: pressEventY, rawEvent: event };

            actor._pressTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOLD_TIMEOUT, () => {
                actor._pressTimeoutId = 0; 
                if (actor._pressEventDetails) { 
                     this._beginDrag(actor, actor._pressEventDetails.rawEvent);
                }
                return GLib.SOURCE_REMOVE;
            });
            
            return Clutter.EVENT_STOP;
        });

        actor.connect('motion-event', (a, event) => {
            if ((event.get_state() & Clutter.ModifierType.BUTTON1_MASK) && actor._pressEventDetails) {
                 if (!this._dragInfo || !this._dragInfo.isDragging) { 
                    const [currentX, currentY] = event.get_coords();
                    const {x: startX, y: startY} = actor._pressEventDetails;
                    if (Math.abs(currentX - startX) > DRAG_THRESHOLD || Math.abs(currentY - startY) > DRAG_THRESHOLD) {
                        if (actor._pressTimeoutId) {
                            GLib.Source.remove(actor._pressTimeoutId);
                            actor._pressTimeoutId = 0;
                        }
                        this._beginDrag(actor, actor._pressEventDetails.rawEvent);
                    }
                 }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        actor.connect('button-release-event', (a, event) => {
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
            
            const wasPressPending = !!actor._pressTimeoutId;
            if (actor._pressTimeoutId) {
                GLib.Source.remove(actor._pressTimeoutId);
                actor._pressTimeoutId = 0;
            }
            
            const clickOccurred = wasPressPending && (!this._dragInfo || !this._dragInfo.isDragging);
            
            if (clickOccurred) {
                this._onTabClicked(win);
            }
            actor._pressEventDetails = null;
            return Clutter.EVENT_STOP;
        });
    }

    _beginDrag(actor, pressEvent) {
        if (this._dragInfo && this._dragInfo.isDragging) { return; }
        if (!actor || actor.get_parent() !== this) {
            console.warn("TabBar: _beginDrag called for an actor not in TabBar or null actor.");
            if (actor && actor._pressTimeoutId) GLib.Source.remove(actor._pressTimeoutId);
            if (actor) actor._pressEventDetails = null;
            return;
        }

        if (actor._pressTimeoutId) {
            GLib.Source.remove(actor._pressTimeoutId);
            actor._pressTimeoutId = 0;
        }
        actor._pressEventDetails = null;

        const [pointerScreenX, pointerScreenY] = pressEvent.get_coords();
        const actorAllocationInTabBar = actor.get_allocation_box();
        const [tabBarScreenX, tabBarScreenY] = this.get_transformed_position();

        const actorInitialScreenX = tabBarScreenX + actorAllocationInTabBar.x1;
        const actorInitialScreenY = tabBarScreenY + actorAllocationInTabBar.y1;

        const originalIndex = this.get_children().indexOf(actor);
        
        const actorWidth = actor.get_width();
        const actorHeight = actor.get_height();

        const slotActor = new St.Bin({ style_class: 'zone-tab-drag-slot', width: actorWidth, height: actorHeight });

        actor.set_opacity(200);
        this.remove_child(actor);
        Main.uiGroup.add_child(actor);
        actor.set_position(actorInitialScreenX, actorInitialScreenY);
        
        try {
            if (typeof actor.raise_top === 'function') {
                actor.raise_top();
            } else { 
                const parent = actor.get_parent();
                if (parent && typeof parent.set_child_above_sibling === 'function') {
                    parent.set_child_above_sibling(actor, null);
                }
            }
        } catch (e) {
            console.error("TabBar: Error trying to raise actor.", e);
        }

        this.insert_child_at_index(slotActor, originalIndex);
        
        this._dragInfo = {
            isDragging: true,
            draggedActor: actor,
            slotActor: slotActor,
            originalIndex: originalIndex,
            actorGrabOffsetX: pointerScreenX - actorInitialScreenX,
            actorGrabOffsetY: pointerScreenY - actorInitialScreenY,
            motionId: global.stage.connect('motion-event', this._onDragMotion.bind(this)),
            releaseId: global.stage.connect('button-release-event', this._onDragRelease.bind(this)),
        };
        
        this._needsLayoutUpdate = true;
        this.queue_relayout();
    }

    _onDragMotion(stage, event) {
        if (!this._dragInfo || !this._dragInfo.isDragging) return Clutter.EVENT_PROPAGATE;

        const [currentPointerScreenX, currentPointerScreenY] = event.get_coords();
        this._dragInfo.draggedActor.set_position(
            currentPointerScreenX - this._dragInfo.actorGrabOffsetX,
            currentPointerScreenY - this._dragInfo.actorGrabOffsetY
        );

        const [tabBarScreenX, ] = this.get_transformed_position();
        const pointerXInTabBar = currentPointerScreenX - tabBarScreenX;

        let newSlotIndex = 0;
        const currentChildren = this.get_children();
        const currentSlotActualIndex = currentChildren.indexOf(this._dragInfo.slotActor);

        if (currentSlotActualIndex === -1) {
            console.error("TabBar: Slot actor not found in TabBar during drag motion.");
            this._cancelDrag(true);
            return Clutter.EVENT_STOP;
        }

        let visualChildIndex = 0;
        for (let i = 0; i < currentChildren.length; i++) {
            const child = currentChildren[i];
            if (child === this._dragInfo.slotActor) continue;

            const childAllocation = child.get_allocation_box();
            const childMidX = childAllocation.x1 + childAllocation.get_width() / 2;
            
            if (pointerXInTabBar > childMidX) {
                newSlotIndex = visualChildIndex + 1;
            }
            visualChildIndex++;
        }
        
        if (currentSlotActualIndex !== newSlotIndex) {
             const tempSlot = this._dragInfo.slotActor;
             if(tempSlot.get_parent() === this) {
                this.set_child_at_index(tempSlot, newSlotIndex);
             } else { 
                console.error("TabBar: Slot actor lost parentage during drag motion.");
                this._cancelDrag(true);
                return Clutter.EVENT_STOP;
             }
            this._needsLayoutUpdate = true;
            this.queue_relayout();
        }
        return Clutter.EVENT_STOP;
    }

    _onDragRelease(stage, event) {
        if (!this._dragInfo || !this._dragInfo.isDragging || event.get_button() !== 1) {
            if (this._dragInfo) { 
                 if (this._dragInfo.motionId) global.stage.disconnect(this._dragInfo.motionId);
                 if (this._dragInfo.releaseId) global.stage.disconnect(this._dragInfo.releaseId);
            }
            this._dragInfo = null;
            return Clutter.EVENT_PROPAGATE;
        }
        
        const { draggedActor, slotActor, motionId, releaseId } = this._dragInfo;

        if (motionId) global.stage.disconnect(motionId);
        if (releaseId) global.stage.disconnect(releaseId);

        let finalInsertionIndex = -1;
        if (slotActor && slotActor.get_parent() === this) {
            finalInsertionIndex = this.get_children().indexOf(slotActor);
        } else if (slotActor) {
             console.warn("TabBar: Slot actor not parented correctly at drag release.");
             finalInsertionIndex = this._dragInfo.originalIndex;
        } else {
            finalInsertionIndex = this._dragInfo.originalIndex;
        }

        if(slotActor) {
            if(slotActor.get_parent() === this) this.remove_child(slotActor);
            slotActor.destroy();
        }

        if(draggedActor) {
            if(draggedActor.get_parent() === Main.uiGroup) Main.uiGroup.remove_child(draggedActor);
            
            const numChildrenAfterSlotRemoval = this.get_n_children();
            const insertionIndex = Math.max(0, Math.min(finalInsertionIndex, numChildrenAfterSlotRemoval));
            
            this.insert_child_at_index(draggedActor, insertionIndex);
            draggedActor.set_opacity(255);
            draggedActor.set_translation(0, 0, 0);
            
            const droppedWindow = draggedActor._tabWindow;
            if (droppedWindow) {
                this._onTabClicked(droppedWindow); 
                this.highlightWindow(droppedWindow);
                if (draggedActor.can_focus) draggedActor.grab_key_focus();
            }
        }
        
        this._dragInfo = null;
        this._needsLayoutUpdate = true;
        this.queue_relayout();
        
        return Clutter.EVENT_STOP;
    }
    
    _cancelDrag(forceCleanup = false) {
        this._tabsData.forEach(td => {
            if (td.actor._pressTimeoutId) {
                GLib.Source.remove(td.actor._pressTimeoutId);
                td.actor._pressTimeoutId = 0;
            }
            td.actor._pressEventDetails = null;
        });
        if (this._pressTimeoutId) {
             GLib.Source.remove(this._pressTimeoutId);
             this._pressTimeoutId = 0;
        }

        if (this._dragInfo && (this._dragInfo.isDragging || forceCleanup)) {
            const { draggedActor, slotActor, originalIndex, motionId, releaseId } = this._dragInfo;

            if (motionId) global.stage.disconnect(motionId);
            if (releaseId) global.stage.disconnect(releaseId);

            if (draggedActor) {
                 if (draggedActor.get_parent() === Main.uiGroup) {
                    Main.uiGroup.remove_child(draggedActor);
                    const isStillManaged = this._tabsData.some(td => td.actor === draggedActor);
                    if (!forceCleanup && isStillManaged && this.get_parent()) {
                        const childrenCount = this.get_n_children(); 
                        const reinsertIdx = Math.min(originalIndex, childrenCount);
                        if (draggedActor.get_parent() !== this) {
                            this.insert_child_at_index(draggedActor, reinsertIdx);
                        }
                    } else if (!isStillManaged && !forceCleanup) {
                        draggedActor.destroy();
                    }
                 }
                 draggedActor.set_opacity(255);
                 draggedActor.set_translation(0,0,0);
            }
            if (slotActor) {
                if (slotActor.get_parent() === this) this.remove_child(slotActor);
                slotActor.destroy();
            }
        }
        this._dragInfo = null;
        
        if (this.get_parent() && (forceCleanup || (this.visible && this.get_n_children() > 0))) {
            this._needsLayoutUpdate = true;
            this.queue_relayout();
        }
    }

    destroy() {
        this._cancelDrag(true); 
        this._tabsData.forEach(({ unmanageId, window }) => {
            if (unmanageId && window) {
                try {
                    window.disconnect(unmanageId);
                } catch (e) { 
                    console.error(`TabBar: Error disconnecting unmanageId ${unmanageId} during destroy: ${e}`);
                }
            }
        });
        this._tabsData = [];
        
        this.get_children().forEach(actor => {
            if (actor._pressTimeoutId) {
                GLib.Source.remove(actor._pressTimeoutId);
                actor._pressTimeoutId = 0;
            }
             actor._pressEventDetails = null;
        });
        if (this._pressTimeoutId) {
            GLib.Source.remove(this._pressTimeoutId);
            this._pressTimeoutId = 0;
        }

        super.destroy();
    }
}
