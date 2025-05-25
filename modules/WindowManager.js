// modules/WindowManager.js

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk'; //
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneDetector } from './ZoneDetector.js'; //
import { TabBar } from './TabBar.js'; //
const log = (context, msg) => console.log(`[AutoZoner.WindowManager.${context}] ${msg}`); //
const ALL_RESIZING_OPS = Meta.GrabOp.RESIZING_N | Meta.GrabOp.RESIZING_S |
    Meta.GrabOp.RESIZING_E | Meta.GrabOp.RESIZING_W |
    Meta.GrabOp.RESIZING_NW | Meta.GrabOp.RESIZING_NE | //
    Meta.GrabOp.RESIZING_SW | Meta.GrabOp.RESIZING_SE |
    Meta.GrabOp.KEYBOARD_RESIZING_N | Meta.GrabOp.KEYBOARD_RESIZING_S | //
    Meta.GrabOp.KEYBOARD_RESIZING_E | Meta.GrabOp.KEYBOARD_RESIZING_W |
    Meta.GrabOp.KEYBOARD_RESIZING_NW | Meta.GrabOp.KEYBOARD_RESIZING_NE | //
    Meta.GrabOp.KEYBOARD_RESIZING_SW | Meta.GrabOp.KEYBOARD_RESIZING_SE; //

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager = settingsManager; //
        this._highlightManager = highlightManager; //
        this._zoneDetector = new ZoneDetector(); //
        this._signalConnections = []; //

        this._snappedWindows = {}; //
        this._cycleIndexByZone = {}; //
        this._tabBars = {}; //

        this._splitStates = new Map(); // Tracks { originalHeight, childZoneId, isActive }
        this._activeDisplayZones = []; // Zones actually used for snapping/display
    }

    _getEvasionKeyMask() {
        const keyName = this._settingsManager.getSnapEvasionKeyName(); //
        switch (keyName?.toLowerCase()) { //
            case 'control': //
                return Clutter.ModifierType.CONTROL_MASK; //
            case 'alt': //
                return Clutter.ModifierType.MOD1_MASK; //
            case 'shift': //
                return Clutter.ModifierType.SHIFT_MASK; //
            case 'super': //
                return Clutter.ModifierType.MOD4_MASK; //
            case 'disabled': //
            default: //
                return 0; //
        }
    }

    _rebuildActiveDisplayZones() {
        log('_rebuildActiveDisplayZones', 'Rebuilding active display zones...');
        const effectiveZones = [];
        const baseZones = this._settingsManager.getZones();

        for (const bz of baseZones) {
            // Ensure each base zone has a stable ID. Using name as fallback if no explicit ID.
            // It's better if zones from settings have a truly unique 'id' field.
            // For this patch, we'll assume `bz.name` is unique or use stringify as a last resort for ID.
            const bzId = bz.id || bz.name || JSON.stringify(bz);
            // Defensive copy:
            const baseZoneCopy = { ...bz, id: bzId };

            const splitState = this._splitStates.get(bzId);

            if (splitState && splitState.isActive) {
                // Upper half of the split zone
                effectiveZones.push({
                    ...baseZoneCopy,
                    height: splitState.originalHeight / 2,
                    originalHeight: splitState.originalHeight, // Keep track for potential nested splits if ever needed
                    isSplitParent: true, // Mark as parent of a split
                    childZoneId: splitState.childZoneId
                });
                // Lower half of the split zone
                effectiveZones.push({
                    id: splitState.childZoneId,
                    monitorIndex: baseZoneCopy.monitorIndex,
                    name: `${baseZoneCopy.name || 'Zone'} (Lower)`, // TODO: i18n if needed
                    x: baseZoneCopy.x,
                    y: baseZoneCopy.y + (splitState.originalHeight / 2),
                    width: baseZoneCopy.width,
                    height: splitState.originalHeight / 2,
                    isSplitChild: true, // Mark as child of a split
                    parentZoneId: bzId
                });
            } else {
                effectiveZones.push(baseZoneCopy);
            }
        }
        this._activeDisplayZones = effectiveZones;
        log('_rebuildActiveDisplayZones', `Rebuilt with ${this._activeDisplayZones.length} active zones.`);
    }

    _rebuildAndResnapAll() {
        log('_rebuildAndResnapAll', 'Starting full rebuild and resnap...');
        // Destroy all existing tab bars
        Object.values(this._tabBars).forEach(bar => bar.destroy());
        this._tabBars = {};

        // Preserve windows that were snapped to specific zones before clearing
        const previouslySnappedWindowsByZone = { ...this._snappedWindows };
        this._snappedWindows = {};
        this._cycleIndexByZone = {};

        this._rebuildActiveDisplayZones();
        this.snapAllWindowsToZones(previouslySnappedWindowsByZone); // Pass previous state for smarter resnapping
        this.updateAllTabAppearances();
        log('_rebuildAndResnapAll', 'Full rebuild and resnap completed.');
    }

    connectSignals() {
        this._disconnectSignals(); //
        if (!this._settingsManager.isZoningEnabled()) { //
            log('connectSignals', 'Zoning disabled.'); //
            return; //
        }
        this._rebuildActiveDisplayZones(); // Initial build of active zones
        this._connect(global.display, 'grab-op-begin', (d, w, o) => this._onGrabOpBegin(d, w, o)); //
        this._connect(global.display, 'grab-op-end', (d, w, o) => this._onGrabOpEnd(d, w, o)); //
        this._connect(global.display, 'window-created', (d, w) => this._onWindowCreated(d, w)); //
        log('connectSignals', 'Signals connected.'); //
    }

    _connect(gobj, name, cb) {
        const id = gobj.connect(name, cb); //
        this._signalConnections.push({ gobj, id }); //
    }

    _disconnectSignals() {
        this._signalConnections.forEach(({ gobj, id }) => { //
            try { gobj.disconnect(id); } catch { } //
        });
        this._signalConnections = []; //
    }

    _onWindowCreated(display, window) {
        if (!this._settingsManager.isZoningEnabled() || //
            !this._settingsManager.isTileNewWindowsEnabled()) //
            return; //
        if (window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) //
            return; //
        GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 150, () => { //
            if (!window || typeof window.get_frame_rect !== 'function' || !window.get_compositor_private()) return GLib.SOURCE_REMOVE; // Added get_compositor_private check

            const rect = window.get_frame_rect(); //
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; //
            const mon = window.get_monitor(); //
            // Use active display zones
            const zoneDef = this._zoneDetector.findTargetZone(this._activeDisplayZones, center, mon); //
            if (zoneDef) { //
                this._snapWindowToZone(window, zoneDef, false); //
                log('_onWindowCreated', `Auto-snapped "${window.get_title()}" into "${zoneDef.name || JSON.stringify(zoneDef)}"`); //
            }
            return GLib.SOURCE_REMOVE; //
        });
    }

    _onGrabOpBegin(display, window, op) {
        const isMouseMoving = (op & Meta.GrabOp.MOVING) !== 0; //
        const isKeyboardMoving = (op & Meta.GrabOp.KEYBOARD_MOVING) !== 0; //

        const evasionKeyMask = this._getEvasionKeyMask(); //
        const [, , mods] = global.get_pointer(); //
        const isEvasionKeyHeld = evasionKeyMask !== 0 && (mods & evasionKeyMask) !== 0; //

        delete window._autoZonerEvasionBypass; //
        if (isEvasionKeyHeld) { //
            window._autoZonerEvasionBypass = true; //
            const keyName = this._settingsManager.getSnapEvasionKeyName(); //
            log('_onGrabOpBegin', `${keyName} key is held for "${window.get_title()}", bypassing highlights and original rect store.`); //
            this._highlightManager?.stopUpdating(); //
            return; //
        }

        if (!(isMouseMoving || isKeyboardMoving)) { //
            log('_onGrabOpBegin', `Operation is not a move (op: ${op}), stopping highlights and skipping further setup.`); //
            this._highlightManager?.stopUpdating(); //
            return; //
        }

        if (!window || !window.get_compositor_private() || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) // Added get_compositor_private check
            return; //
        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) { //
            window._autoZonerOriginalRect = window.get_frame_rect(); //
            log('_onGrabOpBegin', `Stored original rect for "${window.get_title()}" during normal move.`); //
        }
        this._highlightManager?.startUpdating(); //
    }

    _onGrabOpEnd(display, window, op) {
        this._highlightManager?.stopUpdating(); //

        const wasEvasionBypassActiveAtStart = window._autoZonerEvasionBypass; //
        delete window._autoZonerEvasionBypass; //

        const evasionKeyMask = this._getEvasionKeyMask(); //
        const [, , modsAtEnd] = global.get_pointer(); //
        const isEvasionKeyHeldAtEnd = evasionKeyMask !== 0 && (modsAtEnd & evasionKeyMask) !== 0; //
        if (isEvasionKeyHeldAtEnd || wasEvasionBypassActiveAtStart) { //
            const keyName = this._settingsManager.getSnapEvasionKeyName(); //
            log('_onGrabOpEnd', `${keyName} key is (or was at start) held for "${window.get_title()}", bypassing snap logic. Window remains at current pos.`); //
            if (window._autoZonerIsZoned) { //
                this._unsnapWindow(window, /* keepCurrentPosition = */ true); //
            } else { //
                delete window._autoZonerOriginalRect; //
            }
            return; //
        }

        if (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING) { //
            log('_onGrabOpEnd', `Operation is MOVING or KEYBOARD_MOVING (op: ${op}), proceeding to normal snap logic.`); //
        } else if ((op & ALL_RESIZING_OPS) !== 0) { //
            log('_onGrabOpEnd', `Operation is RESIZING (op: ${op}) and not a direct move type, skipping snap.`); //
            return; //
        } else { //
            log('_onGrabOpEnd', `Operation is UNKNOWN or not a snappable type (op: ${op}), skipping snap.`); //
            return; //
        }

        if (!this._settingsManager.isZoningEnabled()) return; //
        if (!window || !window.get_compositor_private() || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) { // Added get_compositor_private check
            this._unsnapWindow(window); //
            return; //
        }

        const [pointerX, pointerY] = global.get_pointer(); //
        const hitRect = new Mtk.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 }); //
        let mon = global.display.get_monitor_index_for_rect(hitRect); //
        if (mon < 0) //
            mon = window.get_monitor(); //
        if (mon < 0 || mon >= Main.layoutManager.monitors.length) { //
            mon = Main.layoutManager.primaryIndex; //
        }

        const center = { x: pointerX, y: pointerY }; //
        // Use active display zones
        const zoneDef = this._zoneDetector.findTargetZone(this._activeDisplayZones, center, mon); //
        if (zoneDef) { //
            this._snapWindowToZone(window, zoneDef, true); //
            log('_onGrabOpEnd', `Snapped "${window.get_title()}" into "${zoneDef.name || JSON.stringify(zoneDef)}"`); //
        } else { //
            this._unsnapWindow(window); //
        }
    }
    
    _getZoneTabBar(zoneId, monitorIndex, zoneDef) {
        let bar = this._tabBars[zoneId]; //
        if (!bar) { //
            bar = new TabBar(zoneId, zoneDef, win => this._activateWindow(zoneId, win), this._settingsManager, this); // Pass zoneDef and this (WindowManager) //
            this._tabBars[zoneId] = bar; //
            Main.uiGroup.add_child(bar); //
        }
        const wa = Main.layoutManager.getWorkAreaForMonitor(monitorIndex); //
        const x = wa.x + zoneDef.x; //
        const y = wa.y + Math.max(0, zoneDef.y); //
        const height = this._settingsManager.getTabBarHeight(); //
        bar.set_position(x, y); //
        bar.set_size(zoneDef.width, height); //
        bar.set_style(`height: ${height}px;`); //
        return bar; //
    }

    snapAllWindowsToZones(previouslySnappedWindowsByZone = null) {
        if (!this._settingsManager.isZoningEnabled()) return; //
        log('snapAllWindowsToZones', `Snapping all windows. Previously snapped: ${previouslySnappedWindowsByZone ? Object.keys(previouslySnappedWindowsByZone).length : 0} zones.`);

        // Ensure active zones are current
        if (this._activeDisplayZones.length === 0) {
            this._rebuildActiveDisplayZones();
        }
        const currentActiveZones = this._activeDisplayZones;

        // If previous state is provided, try to restore windows to their *new* corresponding zones
        if (previouslySnappedWindowsByZone) {
            for (const oldZoneId in previouslySnappedWindowsByZone) {
                const windowsInOldZone = previouslySnappedWindowsByZone[oldZoneId];
                const splitState = this._splitStates.get(oldZoneId); // Check if the *original* zone was split

                windowsInOldZone.forEach(win => {
                    // MODIFIED LINE BELOW
                    if (!win || !win.get_compositor_private() || win.is_fullscreen() || win.get_window_type() !== Meta.WindowType.NORMAL) return;

                    let targetZoneDef = null;
                    if (splitState && splitState.isActive) {
                        // If the original zone is now split, windows that were in it are considered for the upper half by default
                        targetZoneDef = currentActiveZones.find(z => z.id === oldZoneId && z.isSplitParent);
                    } else {
                        // If not split, or if it was a child zone that got removed (handled by parent merge)
                        // Try to find the zone by its ID (which might have been a child ID)
                        targetZoneDef = currentActiveZones.find(z => z.id === oldZoneId);
                    }

                    if (targetZoneDef) {
                        this._snapWindowToZone(win, targetZoneDef, false);
                    } else {
                        // Fallback: try to snap based on current position if no direct mapping found
                        this._snapWindowByCurrentPosition(win, currentActiveZones);
                    }
                });
            }
        }

        // Snap any remaining/newly created windows not handled by the above
        global.get_window_actors().forEach(actor => { //
            const win = actor.get_meta_window(); //
            // Only process if not already snapped by the logic above
            if (!win || !win.get_compositor_private() || win._autoZonerIsZoned || win.is_fullscreen() || win.get_window_type() !== Meta.WindowType.NORMAL) // Added get_compositor_private check
                return; //
            this._snapWindowByCurrentPosition(win, currentActiveZones);
        });
        log('snapAllWindowsToZones', 'Finished snapping all windows.');
    }

    _snapWindowByCurrentPosition(win, zonesToSearch) {
        const rect = win.get_frame_rect(); //
        const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; //
        let mon = win.get_monitor(); //
        if (mon < 0 || mon >= Main.layoutManager.monitors.length) { //
            mon = Main.layoutManager.primaryIndex; //
        }

        let zoneDef = this._zoneDetector.findTargetZone(zonesToSearch, center, mon); //
        if (!zoneDef) { // Fallback to closest zone on the same monitor //
            const wa = Main.layoutManager.getWorkAreaForMonitor(mon); //
            let bestDistanceSq = Infinity;
            let closestZone = null;
            zonesToSearch.filter(z => z.monitorIndex === mon).forEach(zDef => { //
                const zoneCenterX = wa.x + zDef.x + zDef.width / 2; //
                const zoneCenterY = wa.y + zDef.y + zDef.height / 2; //
                const dx = zoneCenterX - center.x; //
                const dy = zoneCenterY - center.y; //
                const distSq = dx * dx + dy * dy; //
                if (distSq < bestDistanceSq) { //
                    bestDistanceSq = distSq; //
                    closestZone = zDef; //
                }
            });
            zoneDef = closestZone; //
        }
        if (zoneDef) this._snapWindowToZone(win, zoneDef, false); //
    }

    _snapWindowToZone(window, zoneDef, isGrabOpContext = false) {
        const zoneId = zoneDef.id || zoneDef.name || JSON.stringify(zoneDef); //
        const oldZoneId = window._autoZonerZoneId; //

        if (oldZoneId && oldZoneId !== zoneId) { //
            // Find from active zones, as oldZoneId might be a dynamic child ID
            const oldZoneDef = this._activeDisplayZones.find(z => z.id === oldZoneId); //
            if (oldZoneDef) { //
                this._getZoneTabBar(oldZoneId, oldZoneDef.monitorIndex, oldZoneDef).removeWindow(window); //
                this._snappedWindows[oldZoneId] = (this._snappedWindows[oldZoneId] || []).filter(w => w !== window); //
            }
        }

        if (window.get_maximized && window.get_maximized()) //
            window.unmaximize(Meta.MaximizeFlags.BOTH); //
        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) { //
            // This check assumes _onGrabOpBegin correctly decided not to store if evasion was active.
            // If we reach here, it's a normal snap or a snap initiated not from a grab op where evasion matters. //
            window._autoZonerOriginalRect = window.get_frame_rect(); //
            log('_snapWindowToZone', `Stored original rect for "${window.get_title()}"`); //
        }

        this._snappedWindows[zoneId] = this._snappedWindows[zoneId] || []; //
        if (!this._snappedWindows[zoneId].includes(window)) //
            this._snappedWindows[zoneId].push(window); //
        this._cycleIndexByZone[zoneId] = (this._snappedWindows[zoneId].length - 1); //
        window._autoZonerIsZoned = true; //
        window._autoZonerZoneId = zoneId; // zoneId here is zoneDef.id //

        const wa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex); //
        const barHeight = this._settingsManager.getTabBarHeight(); //
        const minWindowDim = 50; //
        const zoneGap = this._settingsManager.getZoneGapSize(); //
        let gapPosOffset = 0; let gapSizeReduction = 0; //
        if (zoneGap > 0) { gapPosOffset = Math.floor(zoneGap / 2); gapSizeReduction = zoneGap; //
        }

        const slotX = wa.x + zoneDef.x; //
        let slotW = Math.min(zoneDef.width, (wa.x + wa.width) - slotX); //
        slotW = Math.max(slotW, minWindowDim); //
        const actualZoneYInWorkArea = zoneDef.y; //
        const clippedZoneYInWorkArea = Math.max(0, actualZoneYInWorkArea); //
        const yClippage = clippedZoneYInWorkArea - actualZoneYInWorkArea; //
        const slotContentY = wa.y + clippedZoneYInWorkArea + barHeight; //
        let slotH = Math.min(zoneDef.height - yClippage - barHeight, (wa.y + wa.height) - slotContentY); //
        slotH = Math.max(slotH, minWindowDim); //
        const gappedWindowX = slotX + gapPosOffset; //
        let gappedWindowW = Math.max(slotW - gapSizeReduction, minWindowDim); //
        const gappedWindowY = slotContentY + gapPosOffset; //
        let gappedWindowH = Math.max(slotH - gapSizeReduction, minWindowDim); //
        const tabBarX = wa.x + zoneDef.x + (zoneGap > 0 ? gapPosOffset : 0); //
        const tabBarY = wa.y + clippedZoneYInWorkArea + (zoneGap > 0 ? gapPosOffset : 0); //
        const tabBarW = gappedWindowW; //
        window.move_resize_frame(false, gappedWindowX, gappedWindowY, gappedWindowW, gappedWindowH); //
        const tabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef); //
        tabBar.set_position(tabBarX, tabBarY); //
        tabBar.set_size(tabBarW, barHeight); //
        if (!isGrabOpContext) {  //
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 150, () => { //
                if (window && window.get_compositor_private() && typeof window.get_frame_rect === 'function' && // Added get_compositor_private check
                    window._autoZonerZoneId === zoneId && !window.is_fullscreen() && //
                    window.get_maximized() === Meta.MaximizeFlags.NONE) { //
                    const currentRect = window.get_frame_rect(); //
                    if (currentRect.x !== gappedWindowX || currentRect.y !== gappedWindowY || //
                        currentRect.width !== gappedWindowW || currentRect.height !== gappedWindowH) { //
                        log('_snapWindowToZone[DelayedCheck]', `Window "${window.get_title()}" mismatch. 
Re-applying.`); //
                        window.move_resize_frame(false, gappedWindowX, gappedWindowY, gappedWindowW, gappedWindowH); //
                        const delayedTabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef); //
                        delayedTabBar.set_position(tabBarX, tabBarY); //
                        delayedTabBar.set_size(tabBarW, barHeight); //
                    }
                }
                return GLib.SOURCE_REMOVE; //
            });
        }
        tabBar.addWindow(window); //
        this._activateWindow(zoneId, window); //
    }

    _unsnapWindow(window, keepCurrentPosition = false) {
        const oldZoneId = window._autoZonerZoneId; //
        // Only proceed if it was actually zoned OR if we're explicitly keeping position (e.g. Ctrl-drag of a non-zoned window needs its OriginalRect cleared)
        if (!oldZoneId && !keepCurrentPosition) { //
            return; //
        }
        log('_unsnapWindow', `Unsnapping "${window.get_title()}" from zone "${oldZoneId || 'N/A'}". keepCurrentPosition=${keepCurrentPosition}`); //
        if (!keepCurrentPosition && this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) { //
            const o = window._autoZonerOriginalRect; //
            window.move_resize_frame(false, o.x, o.y, o.width, o.height); //
            delete window._autoZonerOriginalRect;  //
        } else if (keepCurrentPosition) { //
            delete window._autoZonerOriginalRect; //
        }

        if (oldZoneId) {  //
            delete window._autoZonerIsZoned; //
            delete window._autoZonerZoneId; //

            const oldZoneDef = this._activeDisplayZones.find(z => z.id === oldZoneId); // Find from active zones //
            if (oldZoneDef) { //
                const tabBar = this._tabBars[oldZoneId]; //
                if (tabBar) { //
                    tabBar.removeWindow(window); //
                }
            }
            this._snappedWindows[oldZoneId] = (this._snappedWindows[oldZoneId] || []).filter(w => w !== window); //
            if (this._snappedWindows[oldZoneId] && this._snappedWindows[oldZoneId].length === 0) { //
                if (this._tabBars[oldZoneId]) { //
                    this._tabBars[oldZoneId].destroy(); //
                    delete this._tabBars[oldZoneId]; //
                }
                delete this._cycleIndexByZone[oldZoneId]; //
            }
        }
    }

    cycleWindowsInCurrentZone() {
        const focus = global.display.focus_window; //
        if (!focus || !focus._autoZonerZoneId || !focus.get_compositor_private()) { // Added get_compositor_private check
            log('cycle', 'No valid zoned window focused; aborting.'); //
            return; //
        }
        const zoneId = focus._autoZonerZoneId; //
        const list = this._snappedWindows[zoneId] || []; //
        if (list.length < 2) { //
            log('cycle', `Zone "${zoneId}" has ${list.length} window(s); skipping cycle.`); //
            return; //
        }
        let idx = (this._cycleIndexByZone[zoneId] + 1) % list.length; //
        this._cycleIndexByZone[zoneId] = idx; //
        const nextWin = list[idx]; //
        if (!nextWin || !nextWin.get_compositor_private()) { log('cycle', 'Next window in cycle is invalid.'); return; } // Added check
        log('cycle', `Cycling to [${idx}] "${nextWin.get_title()}" in zone "${zoneId}".`); //
        this._activateWindow(zoneId, nextWin); //
    }

    cycleWindowsInCurrentZoneBackward() {
        const focus = global.display.focus_window; //
        if (!focus || !focus._autoZonerZoneId || !focus.get_compositor_private()) { // Added get_compositor_private check
            log('cycle-backward', 'No valid zoned window focused; aborting.'); //
            return; //
        }
        const zoneId = focus._autoZonerZoneId; //
        const list = this._snappedWindows[zoneId] || []; //
        if (list.length < 2) { //
            log('cycle-backward', `Zone "${zoneId}" has ${list.length} window(s); skipping cycle.`); //
            return; //
        }
        let idx = (this._cycleIndexByZone[zoneId] - 1 + list.length) % list.length; //
        this._cycleIndexByZone[zoneId] = idx; //
        const prevWin = list[idx]; //
        if (!prevWin || !prevWin.get_compositor_private()) { log('cycle-backward', 'Previous window in cycle is invalid.'); return; } // Added check
        log('cycle-backward', `Cycling backward to [${idx}] "${prevWin.get_title()}" in zone "${zoneId}".`); //
        this._activateWindow(zoneId, prevWin); //
    }

    _activateWindow(zoneId, window) {
        if (!window || !window.get_compositor_private()) { // Added get_compositor_private check
            log('_activateWindow', 'Attempted to activate an invalid window.');
            return;
        }
        const list = this._snappedWindows[zoneId] || []; //
        const currentWindowIndex = list.indexOf(window); //
        if (currentWindowIndex !== -1) { //
            this._cycleIndexByZone[zoneId] = currentWindowIndex; //
        }
        const now = global.get_current_time(); //
        window.activate(now); //
        this._tabBars[zoneId]?.highlightWindow(window); //
    }

    cleanupWindowProperties() {
        global.get_window_actors().forEach(actor => { //
            const w = actor.get_meta_window(); //
            if (w) { //
                delete w._autoZonerIsZoned; //
                delete w._autoZonerOriginalRect; //
                delete w._autoZonerZoneId; //
                delete w._autoZonerEvasionBypass;  //
            }
        });
    }

    updateAllTabAppearances() {
        log('updateAllTabAppearances', 'Requesting update for appearance of all tab bars.'); //
        for (const zoneId in this._tabBars) { //
            const tabBar = this._tabBars[zoneId]; //
            if (tabBar && typeof tabBar.refreshTabVisuals === 'function') { //
                const zoneDef = this._activeDisplayZones.find(z => z.id === zoneId); // Use active zones //
                log('updateAllTabAppearances', `Refreshing visuals for tab bar: ${zoneId}, zoneDef found: ${!!zoneDef}`); //
                if (zoneDef) { //
                    const wa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex); //
                    const barHeight = this._settingsManager.getTabBarHeight(); //
                    const zoneGap = this._settingsManager.getZoneGapSize(); //
                    const gapPosOffset = zoneGap > 0 ? Math.floor(zoneGap / 2) : 0; //
                    const clippedZoneYInWorkArea = Math.max(0, zoneDef.y); //
                    const tabBarX = wa.x + zoneDef.x + gapPosOffset; //
                    const tabBarY = wa.y + clippedZoneYInWorkArea + gapPosOffset; //
                    const minWindowDim = 50; //
                    let slotW = Math.min(zoneDef.width, (wa.x + wa.width) - (wa.x + zoneDef.x)); //
                    slotW = Math.max(slotW, minWindowDim); //
                    let gappedWindowW = slotW - (zoneGap > 0 ? zoneGap : 0); //
                    gappedWindowW = Math.max(gappedWindowW, minWindowDim); //
                    const tabBarW = gappedWindowW; //

                    // Update TabBar's internal zoneDef if it has changed (e.g. split state)
                    tabBar._zoneDef = zoneDef;
                    tabBar.set_position(tabBarX, tabBarY); //
                    tabBar.set_size(tabBarW, barHeight); //
                    tabBar.set_style(`height: ${barHeight}px;`); //
                    tabBar.refreshTabVisuals(); // Call refreshTabVisuals after properties are set
                }
            }
        }
        log('updateAllTabAppearances', 'Finished updating all tab appearances.');
    }

    toggleZoneSplit(parentZoneIdToToggle) {
        log('toggleZoneSplit', `Toggling split for zone ID: ${parentZoneIdToToggle}`);
        const baseZoneDef = this._settingsManager.getZones().find(z => (z.id || z.name || JSON.stringify(z)) === parentZoneIdToToggle);

        if (!baseZoneDef) {
            log('toggleZoneSplit', `Error: Base zone definition not found for ID: ${parentZoneIdToToggle}`);
            return;
        }
        // Ensure baseZoneDef has an 'id' if it's relying on name/stringify
        const parentId = baseZoneDef.id || baseZoneDef.name || JSON.stringify(baseZoneDef);

        let splitState = this._splitStates.get(parentId);

        if (splitState && splitState.isActive) { // MERGE
            log('toggleZoneSplit', `Merging zone ${parentId} (child: ${splitState.childZoneId})`);
            // Windows in childZoneId will be re-evaluated by snapAllWindowsToZones and should move to the parent
            this._splitStates.delete(parentId);
        } else { // SPLIT
            const originalHeight = baseZoneDef.height; // This should be the full height from gsettings
            const childZoneId = parentId + "_lower"; // Simple ID generation
            log('toggleZoneSplit', `Splitting zone ${parentId}. Original height: ${originalHeight}. Child ID: ${childZoneId}`);
            this._splitStates.set(parentId, {
                originalHeight: originalHeight, // Store the original full height
                childZoneId: childZoneId,
                isActive: true
            });
        }
        this._rebuildAndResnapAll();
    }

    destroy() {
        this._disconnectSignals(); //
        Object.values(this._tabBars).forEach(bar => bar.destroy()); //
        this._tabBars = {}; //
        this._splitStates.clear();
        this._activeDisplayZones = [];
        this.cleanupWindowProperties(); //
        log('destroy', 'Destroyed.'); //
    }

    // Called from extension.js enable/disable or when settings change fundamentally
    refreshZonesAndLayout() {
        this._splitStates.clear(); // Clear any previous dynamic splits
        this._rebuildAndResnapAll();
    }
}
