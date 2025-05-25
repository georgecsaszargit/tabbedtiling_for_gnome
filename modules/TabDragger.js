// ./modules/TabDragger.js
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DRAG_THRESHOLD = 10;
const HOLD_TIMEOUT = 250; // Milliseconds

export class TabDragger {
    constructor(tabBar, onTabClicked) {
        this._tabBar = tabBar;
        this._onTabClicked = onTabClicked; // To reactivate tab after drop
        this._dragInfo = null;
        this._pressTimeoutId = 0;
    }

    initPointerHandlers(actor, win) {
        actor._pressEventDetails = null;
        // actor._pressTimeoutId = 0; // Managed by TabBar instance or dedicated Tab instance if it held this state

        actor.connect('button-press-event', (a, event) => {
            const source = event.get_source();
            if (source && typeof source.has_style_class_name === 'function' && source.has_style_class_name('zone-tab-close-button')) {
                return Clutter.EVENT_PROPAGATE;
            }
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;

            actor.grab_key_focus();

            if (actor._pressTimeoutId) GLib.Source.remove(actor._pressTimeoutId); // [cite: 280]

            const [pressEventX, pressEventY] = event.get_coords();
            actor._pressEventDetails = { time: event.get_time(), x: pressEventX, y: pressEventY, rawEvent: event }; // [cite: 280]

            actor._pressTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOLD_TIMEOUT, () => { // [cite: 280]
                actor._pressTimeoutId = 0; // [cite: 280]
                if (actor._pressEventDetails) { // [cite: 281]
                    this._beginDrag(actor, actor._pressEventDetails.rawEvent); // [cite: 281]
                }
                return GLib.SOURCE_REMOVE; // [cite: 281]
            });
            return Clutter.EVENT_STOP; // [cite: 282]
        });

        actor.connect('motion-event', (a, event) => {
            if ((event.get_state() & Clutter.ModifierType.BUTTON1_MASK) && actor._pressEventDetails) { // [cite: 282]
                if (!this._dragInfo || !this._dragInfo.isDragging) { // [cite: 282]
                    const [currentX, currentY] = event.get_coords();
                    const { x: startX, y: startY } = actor._pressEventDetails;
                    if (Math.abs(currentX - startX) > DRAG_THRESHOLD || Math.abs(currentY - startY) > DRAG_THRESHOLD) { // [cite: 283]
                        if (actor._pressTimeoutId) { // [cite: 283]
                            GLib.Source.remove(actor._pressTimeoutId); // [cite: 283]
                            actor._pressTimeoutId = 0; // [cite: 284]
                        }
                        this._beginDrag(actor, actor._pressEventDetails.rawEvent); // [cite: 284]
                    }
                }
            }
            return Clutter.EVENT_PROPAGATE; // [cite: 285]
        });

        actor.connect('button-release-event', (a, event) => {
            const source = event.get_source();
            if (source && typeof source.has_style_class_name === 'function' && source.has_style_class_name('zone-tab-close-button')) {
                return Clutter.EVENT_PROPAGATE;
            }
            if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE; // [cite: 286]

            const wasPressPending = !!actor._pressTimeoutId; // [cite: 287]
            if (actor._pressTimeoutId) { // [cite: 287]
                GLib.Source.remove(actor._pressTimeoutId); // [cite: 287]
                actor._pressTimeoutId = 0; // [cite: 287]
            }

            const clickOccurred = wasPressPending && (!this._dragInfo || !this._dragInfo.isDragging); // [cite: 287]

            if (clickOccurred) {
                this._onTabClicked(win); // [cite: 288]
            }
            actor._pressEventDetails = null; // [cite: 288]
            // If a drag operation was completed, _onDragRelease would handle it.
            // This primarily handles the click scenario.
            return Clutter.EVENT_STOP; // [cite: 288]
        });
    }

    _beginDrag(actor, pressEvent) {
        if (this._dragInfo && this._dragInfo.isDragging) return; // [cite: 289]
        if (!actor || actor.get_parent() !== this._tabBar) { // [cite: 290]
            console.warn("TabDragger: _beginDrag called for an actor not in the managed TabBar or null actor.");
            if (actor && actor._pressTimeoutId) GLib.Source.remove(actor._pressTimeoutId); // [cite: 291]
            if (actor) actor._pressEventDetails = null; // [cite: 291]
            return; // [cite: 291]
        }

        if (actor._pressTimeoutId) { // [cite: 292]
            GLib.Source.remove(actor._pressTimeoutId); // [cite: 292]
            actor._pressTimeoutId = 0; // [cite: 293]
        }
        actor._pressEventDetails = null; // [cite: 293]

        const [pointerScreenX, pointerScreenY] = pressEvent.get_coords(); // [cite: 293]
        const actorAllocationInTabBar = actor.get_allocation_box(); // [cite: 294]
        const [tabBarScreenX, tabBarScreenY] = this._tabBar.get_transformed_position(); // [cite: 294]

        const actorInitialScreenX = tabBarScreenX + actorAllocationInTabBar.x1; // [cite: 294]
        const actorInitialScreenY = tabBarScreenY + actorAllocationInTabBar.y1; // [cite: 295]

        const originalIndex = this._tabBar.get_children().indexOf(actor); // [cite: 295]

        const actorWidth = actor.get_width(); // [cite: 295]
        const actorHeight = actor.get_height(); // [cite: 295]
        const slotActor = new St.Bin({ style_class: 'zone-tab-drag-slot', width: actorWidth, height: actorHeight }); // [cite: 296]

        actor.set_opacity(200); // [cite: 296]
        this._tabBar.remove_child(actor); // [cite: 296]
        Main.uiGroup.add_child(actor); // [cite: 296]
        actor.set_position(actorInitialScreenX, actorInitialScreenY); // [cite: 296]
        try { // [cite: 297]
            if (typeof actor.raise_top === 'function') { // [cite: 297]
                actor.raise_top(); // [cite: 297]
            } else {
                const parent = actor.get_parent(); // [cite: 298]
                if (parent && typeof parent.set_child_above_sibling === 'function') { // [cite: 299]
                    parent.set_child_above_sibling(actor, null); // [cite: 299]
                }
            }
        } catch (e) {
            console.error("TabDragger: Error trying to raise actor.", e); // [cite: 300]
        }

        this._tabBar.insert_child_at_index(slotActor, originalIndex); // [cite: 301]
        this._dragInfo = { // [cite: 302]
            isDragging: true, // [cite: 302]
            draggedActor: actor, // [cite: 302]
            slotActor: slotActor, // [cite: 302]
            originalIndex: originalIndex, // [cite: 302]
            actorGrabOffsetX: pointerScreenX - actorInitialScreenX, // [cite: 302]
            actorGrabOffsetY: pointerScreenY - actorInitialScreenY, // [cite: 303]
            motionId: global.stage.connect('motion-event', this._onDragMotion.bind(this)), // [cite: 303]
            releaseId: global.stage.connect('button-release-event', this._onDragRelease.bind(this)), // [cite: 303]
        };
        this._tabBar.requestLayoutUpdate(true); // [cite: 304]
    }

    _onDragMotion(stage, event) {
        if (!this._dragInfo || !this._dragInfo.isDragging) return Clutter.EVENT_PROPAGATE; // [cite: 304]
        const [currentPointerScreenX, currentPointerScreenY] = event.get_coords(); // [cite: 305]
        this._dragInfo.draggedActor.set_position( // [cite: 305]
            currentPointerScreenX - this._dragInfo.actorGrabOffsetX,
            currentPointerScreenY - this._dragInfo.actorGrabOffsetY
        );
        const [tabBarScreenX, ] = this._tabBar.get_transformed_position(); // [cite: 306]
        const pointerXInTabBar = currentPointerScreenX - tabBarScreenX; // [cite: 306]

        let newSlotIndex = 0; // [cite: 306]
        const currentChildren = this._tabBar.get_children(); // [cite: 306]
        const currentSlotActualIndex = currentChildren.indexOf(this._dragInfo.slotActor); // [cite: 307]

        if (currentSlotActualIndex === -1) { // [cite: 307]
            console.error("TabDragger: Slot actor not found in TabBar during drag motion."); // [cite: 307]
            this.cancelDrag(true); // [cite: 308]
            return Clutter.EVENT_STOP; // [cite: 308]
        }

        let visualChildIndex = 0; // [cite: 308]
        for (let i = 0; i < currentChildren.length; i++) { // [cite: 309]
            const child = currentChildren[i]; // [cite: 309]
            if (child === this._dragInfo.slotActor) continue; // [cite: 310]

            const childAllocation = child.get_allocation_box(); // [cite: 310]
            const childMidX = childAllocation.x1 + childAllocation.get_width() / 2; // [cite: 310]
            if (pointerXInTabBar > childMidX) { // [cite: 311]
                newSlotIndex = visualChildIndex + 1; // [cite: 311]
            }
            visualChildIndex++; // [cite: 312]
        }

        if (currentSlotActualIndex !== newSlotIndex) { // [cite: 313]
            const tempSlot = this._dragInfo.slotActor; // [cite: 313]
            if (tempSlot.get_parent() === this._tabBar) { // [cite: 314]
                this._tabBar.set_child_at_index(tempSlot, newSlotIndex); // [cite: 314]
            } else {
                console.error("TabDragger: Slot actor lost parentage during drag motion."); // [cite: 315]
                this.cancelDrag(true); // [cite: 316]
                return Clutter.EVENT_STOP; // [cite: 316]
            }
            this._tabBar.requestLayoutUpdate(true); // [cite: 316]
        }
        return Clutter.EVENT_STOP; // [cite: 317]
    }

    _onDragRelease(stage, event) {
        if (!this._dragInfo || !this._dragInfo.isDragging || event.get_button() !== 1) { // [cite: 318]
            if (this._dragInfo) { // [cite: 318]
                if (this._dragInfo.motionId) global.stage.disconnect(this._dragInfo.motionId); // [cite: 318]
                if (this._dragInfo.releaseId) global.stage.disconnect(this._dragInfo.releaseId); // [cite: 319]
            }
            this._dragInfo = null; // [cite: 319]
            return Clutter.EVENT_PROPAGATE; // [cite: 319]
        }

        const { draggedActor, slotActor, motionId, releaseId, originalIndex } = this._dragInfo; // [cite: 320]
        if (motionId) global.stage.disconnect(motionId); // [cite: 320]
        if (releaseId) global.stage.disconnect(releaseId); // [cite: 321]

        let finalInsertionIndex = -1; // [cite: 321]
        if (slotActor && slotActor.get_parent() === this._tabBar) { // [cite: 321]
            finalInsertionIndex = this._tabBar.get_children().indexOf(slotActor); // [cite: 321]
        } else if (slotActor) {
            console.warn("TabDragger: Slot actor not parented correctly at drag release."); // [cite: 322]
            finalInsertionIndex = originalIndex; // Fallback to original index [cite: 323]
        } else {
            finalInsertionIndex = originalIndex; // [cite: 323]
        }

        if (slotActor) { // [cite: 324]
            if (slotActor.get_parent() === this._tabBar) this._tabBar.remove_child(slotActor); // [cite: 324]
            slotActor.destroy(); // [cite: 325]
        }

        if (draggedActor) { // [cite: 325]
            if (draggedActor.get_parent() === Main.uiGroup) Main.uiGroup.remove_child(draggedActor); // [cite: 325]
            const numChildrenAfterSlotRemoval = this._tabBar.get_n_children(); // [cite: 326]
            const insertionIndex = Math.max(0, Math.min(finalInsertionIndex, numChildrenAfterSlotRemoval)); // [cite: 326]

            this._tabBar.insert_child_at_index(draggedActor, insertionIndex); // [cite: 326]
            draggedActor.set_opacity(255); // [cite: 326]
            draggedActor.set_translation(0, 0, 0); // [cite: 326]

            const droppedWindow = draggedActor._tabWindow; // [cite: 326]
            if (droppedWindow) { // [cite: 327]
                this._onTabClicked(droppedWindow); // [cite: 327]
                if (draggedActor.can_focus) draggedActor.grab_key_focus(); // [cite: 328]
            }
        }

        this._dragInfo = null; // [cite: 328]
        this._tabBar.requestLayoutUpdate(true); // [cite: 329]
        return Clutter.EVENT_STOP; // [cite: 329]
    }

    cancelDrag(forceCleanup = false) {
        // Clean up any pending press timeouts on individual tab actors
        this._tabBar.getTabActors().forEach(actor => { // [cite: 329]
            if (actor._pressTimeoutId) {
                GLib.Source.remove(actor._pressTimeoutId);
                actor._pressTimeoutId = 0;
            }
            actor._pressEventDetails = null;
        });

        if (this._pressTimeoutId) { // [cite: 330]
            GLib.Source.remove(this._pressTimeoutId); // [cite: 330]
            this._pressTimeoutId = 0; // [cite: 331]
        }

        if (this._dragInfo && (this._dragInfo.isDragging || forceCleanup)) { // [cite: 331]
            const { draggedActor, slotActor, originalIndex, motionId, releaseId } = this._dragInfo; // [cite: 331]
            if (motionId) global.stage.disconnect(motionId); // [cite: 332]
            if (releaseId) global.stage.disconnect(releaseId); // [cite: 332]

            if (draggedActor) { // [cite: 332]
                if (draggedActor.get_parent() === Main.uiGroup) { // [cite: 332]
                    Main.uiGroup.remove_child(draggedActor); // [cite: 332]
                    // Check if tab still exists in TabBar's data model
                    const isStillManaged = this._tabBar.hasWindow(draggedActor._tabWindow); // [cite: 333]
                    if (!forceCleanup && isStillManaged && this._tabBar.get_parent()) { // [cite: 333]
                        const childrenCount = this._tabBar.get_n_children(); // [cite: 333]
                        const reinsertIdx = Math.min(originalIndex, childrenCount); // [cite: 334]
                        if (draggedActor.get_parent() !== this._tabBar) { // [cite: 334]
                           this._tabBar.insert_child_at_index(draggedActor, reinsertIdx); // [cite: 334]
                        }
                    } else if (!isStillManaged && !forceCleanup) { // If no longer managed (e.g. window closed during drag)
                        //draggedActor.destroy(); // The TabBar's removeWindow should handle this
                    }
                }
                draggedActor.set_opacity(255); // [cite: 336]
                draggedActor.set_translation(0, 0, 0); // [cite: 337]
            }
            if (slotActor) { // [cite: 337]
                if (slotActor.get_parent() === this._tabBar) this._tabBar.remove_child(slotActor); // [cite: 337]
                slotActor.destroy(); // [cite: 338]
            }
        }
        this._dragInfo = null; // [cite: 338]
        if (this._tabBar.get_parent() && (forceCleanup || (this._tabBar.visible && this._tabBar.get_n_children() > 0))) { // [cite: 339]
            this._tabBar.requestLayoutUpdate(true); // [cite: 339]
        }
    }

    isDragging() {
        return this._dragInfo && this._dragInfo.isDragging;
    }

    getDraggedActor() {
        return this._dragInfo ? this._dragInfo.draggedActor : null;
    }


    destroy() {
        this.cancelDrag(true);
        // Any other specific cleanup for TabDragger
    }
}
