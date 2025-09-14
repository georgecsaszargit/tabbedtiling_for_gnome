// ./modules/TabDragger.js
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DRAG_THRESHOLD = 10;
const HOLD_TIMEOUT = 250; // Milliseconds

export class TabDragger {
    constructor(tabBar, onTabClicked) {
        this._tabBar = tabBar;
        this._onTabClicked = onTabClicked; // To reactivate tab after drop
        this._dragInfo = null;
        this._pressTimeoutId = 0;
        this._windowTracker = Shell.WindowTracker.get_default();        
    }

    initPointerHandlers(actor, win) {
        actor._pressEventDetails = null;
        actor.connect('button-press-event', (a, event) => {
            const source = event.get_source();
            if (source && typeof source.has_style_class_name === 'function' && source.has_style_class_name('zone-tab-close-button')) {
                return Clutter.EVENT_PROPAGATE;
            }
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
                    const { x: startX, y: startY } = actor._pressEventDetails;
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
            const source = event.get_source();
            if (source && typeof source.has_style_class_name === 'function' && source.has_style_class_name('zone-tab-close-button')) {
                return Clutter.EVENT_PROPAGATE;
            }
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
            // If a drag operation was completed, _onDragRelease would handle it.
            // This primarily handles the click scenario.
            return Clutter.EVENT_STOP; 
        });
    }

    _beginDrag(actor, pressEvent) {
        if (this._dragInfo && this._dragInfo.isDragging) return; 
        if (!actor || actor.get_parent() !== this._tabBar) { 
            console.warn("TabDragger: _beginDrag called for an actor not in the managed TabBar or null actor.");
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
        const [tabBarScreenX, tabBarScreenY] = this._tabBar.get_transformed_position(); 

        const actorInitialScreenX = tabBarScreenX + actorAllocationInTabBar.x1; 
        const actorInitialScreenY = tabBarScreenY + actorAllocationInTabBar.y1; 

        const originalIndex = this._tabBar.get_children().indexOf(actor); 

        const actorWidth = actor.get_width(); 
        const actorHeight = actor.get_height(); 
        const slotActor = new St.Bin({ style_class: 'zone-tab-drag-slot', width: actorWidth, height: actorHeight }); 

        actor.set_opacity(200); 
        this._tabBar.remove_child(actor); 
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
            console.error("TabDragger: Error trying to raise actor.", e); 
        }

        this._tabBar.insert_child_at_index(slotActor, originalIndex); 
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
        this._tabBar.requestLayoutUpdate(true); 
    }

    _onDragMotion(stage, event) {
        if (!this._dragInfo || !this._dragInfo.isDragging) return Clutter.EVENT_PROPAGATE; 
        const [currentPointerScreenX, currentPointerScreenY] = event.get_coords(); 
        this._dragInfo.draggedActor.set_position( 
            currentPointerScreenX - this._dragInfo.actorGrabOffsetX,
            currentPointerScreenY - this._dragInfo.actorGrabOffsetY
        );
        const [tabBarScreenX, ] = this._tabBar.get_transformed_position(); 
        const pointerXInTabBar = currentPointerScreenX - tabBarScreenX; 

        let newSlotIndex = 0; 
        const currentChildren = this._tabBar.get_children(); 
        const currentSlotActualIndex = currentChildren.indexOf(this._dragInfo.slotActor); 

        if (currentSlotActualIndex === -1) { 
            console.error("TabDragger: Slot actor not found in TabBar during drag motion."); 
            this.cancelDrag(true); 
            return Clutter.EVENT_STOP; 
        }

        // Compute slot target among TAB ACTORS only (ignore split button and non-tab children)
        let visualChildIndex = 0; 
        const tabActors = [];
        for (let i = 0; i < currentChildren.length; i++) {
            const child = currentChildren[i];
            if (child === this._dragInfo.slotActor) continue;
            if (!child || !child._tabWindow) continue; // skip split button and others
            tabActors.push(child);
            const childAllocation = child.get_allocation_box();
            const childMidX = childAllocation.x1 + childAllocation.get_width() / 2;
            if (pointerXInTabBar > childMidX) {
                newSlotIndex = visualChildIndex + 1;
            }
            visualChildIndex++;
        }

        // --- Cluster integrity enforcement during drag ---
        // Derive app keys per tab and clusters (runs of the same key).
        const draggedWin = this._dragInfo.draggedActor?._tabWindow;
        const draggedKey = this._appKey(draggedWin);
        const keys = tabActors.map(a => this._appKey(a._tabWindow));
        const clusters = this._computeClusters(keys); // [{key,start,end}, ...] on tab indices

        // 1) Prevent dragging a tab out of its own cluster: snap to the right end of its cluster.
        const sameCluster = clusters.find(c => c.key === draggedKey);
        if (sameCluster) {
            const rightOfOwnCluster = sameCluster.end + 1;
            if (newSlotIndex < sameCluster.start || newSlotIndex > rightOfOwnCluster) {
                newSlotIndex = rightOfOwnCluster;
            }
        }

        // 2) Prevent inserting a different app into the middle of another cluster:
        // if target index falls strictly inside a cluster of a different key, snap to end of that cluster.
        const hit = clusters.find(c =>
            newSlotIndex > c.start && newSlotIndex <= c.end && c.key !== draggedKey
        );
        if (hit) {
            newSlotIndex = hit.end + 1;
        }

        if (currentSlotActualIndex !== newSlotIndex) { 
            const tempSlot = this._dragInfo.slotActor; 
            if (tempSlot.get_parent() === this._tabBar) { 
                this._tabBar.set_child_at_index(tempSlot, newSlotIndex); 
            } else {
                console.error("TabDragger: Slot actor lost parentage during drag motion."); 
                this.cancelDrag(true); 
                return Clutter.EVENT_STOP; 
            }
            this._tabBar.requestLayoutUpdate(true); 
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

        const { draggedActor, slotActor, motionId, releaseId, originalIndex } = this._dragInfo; 
        if (motionId) global.stage.disconnect(motionId); 
        if (releaseId) global.stage.disconnect(releaseId); 

        let finalInsertionIndex = -1; 
        if (slotActor && slotActor.get_parent() === this._tabBar) { 
            finalInsertionIndex = this._tabBar.get_children().indexOf(slotActor); 
        } else if (slotActor) {
            console.warn("TabDragger: Slot actor not parented correctly at drag release."); 
            finalInsertionIndex = originalIndex; // Fallback to original index [cite: 323]
        } else {
            finalInsertionIndex = originalIndex; 
        }

        if (slotActor) { 
            if (slotActor.get_parent() === this._tabBar) this._tabBar.remove_child(slotActor); 
            slotActor.destroy(); 
        }

        if (draggedActor) { 
            if (draggedActor.get_parent() === Main.uiGroup) Main.uiGroup.remove_child(draggedActor); 
            const numChildrenAfterSlotRemoval = this._tabBar.get_n_children(); 
            const insertionIndex = Math.max(0, Math.min(finalInsertionIndex, numChildrenAfterSlotRemoval)); 

            this._tabBar.insert_child_at_index(draggedActor, insertionIndex); 
            draggedActor.set_opacity(255); 
            draggedActor.set_translation(0, 0, 0); 

            const droppedWindow = draggedActor._tabWindow; 
            if (droppedWindow) { 
                this._onTabClicked(droppedWindow); 
                if (draggedActor.can_focus) draggedActor.grab_key_focus(); 
            }
            // Let TabBar/WindowManager re-apply any final cluster normalization
            try { this._tabBar.notifyTabsReordered?.(); } catch (_) {}            
        }

        this._dragInfo = null; 
        this._tabBar.requestLayoutUpdate(true); 
        return Clutter.EVENT_STOP; 
    }

    cancelDrag(forceCleanup = false) {
        // Clean up any pending press timeouts on individual tab actors
        this._tabBar.getTabActors().forEach(actor => { 
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

        if (this._dragInfo && (this._dragInfo.isDragging || forceCleanup)) { 
            const { draggedActor, slotActor, originalIndex, motionId, releaseId } = this._dragInfo; 
            if (motionId) global.stage.disconnect(motionId); 
            if (releaseId) global.stage.disconnect(releaseId); 

            if (draggedActor) { 
                if (draggedActor.get_parent() === Main.uiGroup) { 
                    Main.uiGroup.remove_child(draggedActor); 
                    // Check if tab still exists in TabBar's data model
                    const isStillManaged = this._tabBar.hasWindow(draggedActor._tabWindow); 
                    if (!forceCleanup && isStillManaged && this._tabBar.get_parent()) { 
                        const childrenCount = this._tabBar.get_n_children(); 
                        const reinsertIdx = Math.min(originalIndex, childrenCount); 
                        if (draggedActor.get_parent() !== this._tabBar) { 
                           this._tabBar.insert_child_at_index(draggedActor, reinsertIdx); 
                        }
                    } else if (!isStillManaged && !forceCleanup) { // If no longer managed (e.g. window closed during drag)
                        //draggedActor.destroy(); // The TabBar's removeWindow should handle this
                    }
                }
                draggedActor.set_opacity(255); 
                draggedActor.set_translation(0, 0, 0); 
            }
            if (slotActor) { 
                if (slotActor.get_parent() === this._tabBar) this._tabBar.remove_child(slotActor); 
                slotActor.destroy(); 
            }
        }
        this._dragInfo = null; 
        if (this._tabBar.get_parent() && (forceCleanup || (this._tabBar.visible && this._tabBar.get_n_children() > 0))) { 
            this._tabBar.requestLayoutUpdate(true); 
        }
    }

    isDragging() {
        return this._dragInfo && this._dragInfo.isDragging;
    }

    getDraggedActor() {
        return this._dragInfo ? this._dragInfo.draggedActor : null;
    }

    // ---------- helpers ----------
    _appKey(win) {
        if (!win) return 'win:unknown';
        try {
            const app = this._windowTracker.get_window_app(win);
            if (app && typeof app.get_id === 'function') return `app:${app.get_id()}`;
        } catch (_) {}
        try {
            const cls = typeof win.get_wm_class === 'function' ? win.get_wm_class() : null;
            if (cls) return `wm:${cls}`;
        } catch (_) {}
        return 'win:unknown';
    }

    /**
     * Compute contiguous clusters (runs) of identical keys.
     * @param {string[]} keys - per-tab app keys, in visual tab order (excluding slot)
     * @returns {{key:string,start:number,end:number}[]}
     */
    _computeClusters(keys) {
        const out = [];
        if (!Array.isArray(keys) || !keys.length) return out;
        let start = 0;
        for (let i = 1; i <= keys.length; i++) {
            if (i === keys.length || keys[i] !== keys[start]) {
                out.push({ key: keys[start], start, end: i - 1 });
                start = i;
            }
        }
        return out;
    }

    destroy() {
        this.cancelDrag(true);
        // Any other specific cleanup for TabDragger
    }
}
