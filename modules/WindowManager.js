// modules/WindowManager.js

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Mtk from 'gi://Mtk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneDetector } from './ZoneDetector.js';
import { TabBar } from './TabBar.js';

const log = (context, msg) => console.log(`[AutoZoner.WindowManager.${context}] ${msg}`);
const ALL_RESIZING_OPS = Meta.GrabOp.RESIZING_N | Meta.GrabOp.RESIZING_S |
    Meta.GrabOp.RESIZING_E | Meta.GrabOp.RESIZING_W |
    Meta.GrabOp.RESIZING_NW | Meta.GrabOp.RESIZING_NE |
    Meta.GrabOp.RESIZING_SW | Meta.GrabOp.RESIZING_SE |
    Meta.GrabOp.KEYBOARD_RESIZING_N | Meta.GrabOp.KEYBOARD_RESIZING_S |
    Meta.GrabOp.KEYBOARD_RESIZING_E | Meta.GrabOp.KEYBOARD_RESIZING_W |
    Meta.GrabOp.KEYBOARD_RESIZING_NW | Meta.GrabOp.KEYBOARD_RESIZING_NE |
    Meta.GrabOp.KEYBOARD_RESIZING_SW | Meta.GrabOp.KEYBOARD_RESIZING_SE;

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager = settingsManager;
        this._highlightManager = highlightManager;
        this._zoneDetector = new ZoneDetector();
        this._signalConnections = [];

        this._snappedWindows = {};
        this._cycleIndexByZone = {};
        this._tabBars = {};
    }

    connectSignals() {
        this._disconnectSignals();
        if (!this._settingsManager.isZoningEnabled()) {
            log('connectSignals', 'Zoning disabled.');
            return;
        }
        this._connect(global.display, 'grab-op-begin', (d, w, o) => this._onGrabOpBegin(d, w, o));
        this._connect(global.display, 'grab-op-end', (d, w, o) => this._onGrabOpEnd(d, w, o));
        this._connect(global.display, 'window-created', (d, w) => this._onWindowCreated(d, w));
        log('connectSignals', 'Signals connected.');
    }

    _connect(gobj, name, cb) {
        const id = gobj.connect(name, cb);
        this._signalConnections.push({ gobj, id });
    }

    _disconnectSignals() {
        this._signalConnections.forEach(({ gobj, id }) => {
            try { gobj.disconnect(id); } catch { }
        });
        this._signalConnections = [];
    }

    _onWindowCreated(display, window) {
        if (!this._settingsManager.isZoningEnabled() ||
            !this._settingsManager.isTileNewWindowsEnabled())
            return;
        if (window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 150, () => {
            if (!window || typeof window.get_frame_rect !== 'function') return GLib.SOURCE_REMOVE;

            const rect = window.get_frame_rect();
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            const mon = window.get_monitor();
            const zones = this._settingsManager.getZones();
            const zoneDef = this._zoneDetector.findTargetZone(zones, center, mon);
            if (zoneDef) {
                this._snapWindowToZone(window, zoneDef, false);
                log('_onWindowCreated', `Auto-snapped "${window.get_title()}" into "${zoneDef.name || JSON.stringify(zoneDef)}"`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _onGrabOpBegin(display, window, op) {
        const isMouseMoving = (op & Meta.GrabOp.MOVING) !== 0;
        const isKeyboardMoving = (op & Meta.GrabOp.KEYBOARD_MOVING) !== 0;

        if (!(isMouseMoving || isKeyboardMoving)) {
            log('_onGrabOpBegin', `Operation is not a move (op: ${op}), stopping highlights and skipping further setup.`);
            this._highlightManager?.stopUpdating();
            return;
        }

        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL)
            return;
        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
            window._autoZonerOriginalRect = window.get_frame_rect();
            log('_onGrabOpBegin', `Stored original rect for "${window.get_title()}" during move.`);
        }
        this._highlightManager?.startUpdating();
    }

    _onGrabOpEnd(display, window, op) {
        this._highlightManager?.stopUpdating();
        if (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING) {
            log('_onGrabOpEnd', `Operation is MOVING or KEYBOARD_MOVING (op: ${op}), proceeding to snap logic.`);
        } else if ((op & ALL_RESIZING_OPS) !== 0) {
            log('_onGrabOpEnd', `Operation is RESIZING (op: ${op}) and not a direct move type, skipping snap.`);
            return;
        } else {
            log('_onGrabOpEnd', `Operation is UNKNOWN or not a snappable type (op: ${op}), skipping snap.`);
            return;
        }

        if (!this._settingsManager.isZoningEnabled()) return;
        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) {
            this._unsnapWindow(window);
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const hitRect = new Mtk.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 });
        let mon = global.display.get_monitor_index_for_rect(hitRect);
        if (mon < 0)
            mon = window.get_monitor();
        if (mon < 0 || mon >= Main.layoutManager.monitors.length) {
            mon = Main.layoutManager.primaryIndex;
        }

        const center = { x: pointerX, y: pointerY };
        const zones = this._settingsManager.getZones();
        const zoneDef = this._zoneDetector.findTargetZone(zones, center, mon);
        if (zoneDef) {
            this._snapWindowToZone(window, zoneDef, true);
            log('_onGrabOpEnd', `Snapped "${window.get_title()}" into "${zoneDef.name || JSON.stringify(zoneDef)}"`);
        } else {
            this._unsnapWindow(window);
        }
    }

    _getZoneTabBar(zoneId, monitorIndex, zoneDef) {
        let bar = this._tabBars[zoneId];
        if (!bar) {
            bar = new TabBar(zoneId, win => this._activateWindow(zoneId, win), this._settingsManager);
            this._tabBars[zoneId] = bar;
            Main.uiGroup.add_child(bar);
        }
        const wa = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        const x = wa.x + zoneDef.x;
        const y = wa.y + Math.max(0, zoneDef.y); // Ensure tab bar doesn't go above work area top
        const height = this._settingsManager.getTabBarHeight();
        bar.set_position(x, y);
        bar.set_size(zoneDef.width, height); // Tab bar should span the width of the zone
        bar.set_style(`height: ${height}px;`); // Explicit height for the container

        return bar;
    }

    snapAllWindowsToZones() {
        if (!this._settingsManager.isZoningEnabled()) return;
        const zones = this._settingsManager.getZones();

        global.get_window_actors().forEach(actor => {
            const win = actor.get_meta_window();
            if (!win || win.is_fullscreen() || win.get_window_type() !== Meta.WindowType.NORMAL)
                return;

            const rect = win.get_frame_rect();
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            const mon = win.get_monitor();
            
            let currentMonitorIndex = mon;
            if (currentMonitorIndex < 0 || currentMonitorIndex >= Main.layoutManager.monitors.length) {
                 currentMonitorIndex = Main.layoutManager.primaryIndex;
            }
            
            let zoneDef = this._zoneDetector.findTargetZone(zones, center, currentMonitorIndex);
            if (!zoneDef) { // If window center not in a zone, try to find nearest zone on its current monitor
                const wa = Main.layoutManager.getWorkAreaForMonitor(currentMonitorIndex);
                let best, bestDist = Infinity;
                zones.filter(z => z.monitorIndex === currentMonitorIndex).forEach(z => {
                    const zx = wa.x + z.x + z.width / 2; // zone center x
                    const zy = wa.y + z.y + z.height / 2; // zone center y
                    const dx = zx - center.x, dy = zy - center.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestDist) { bestDist = d2; best = z; }
                });
                zoneDef = best; // This might be undefined if no zones on that monitor
            }

            if (zoneDef)
                this._snapWindowToZone(win, zoneDef, false);
        });
    }

    _snapWindowToZone(window, zoneDef, isGrabOpContext = false) {
        const zoneId = zoneDef.name || JSON.stringify(zoneDef);
        const oldZoneId = window._autoZonerZoneId;

        if (oldZoneId && oldZoneId !== zoneId) {
            const oldDef = this._settingsManager.getZones()
                .find(z => (z.name || JSON.stringify(z)) === oldZoneId);
            if (oldDef) {
                this._getZoneTabBar(oldZoneId, oldDef.monitorIndex, oldDef)
                    .removeWindow(window);
                this._snappedWindows[oldZoneId] =
                    (this._snappedWindows[oldZoneId] || []).filter(w => w !== window);
            }
        }

        if (window.get_maximized && window.get_maximized())
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect)
            window._autoZonerOriginalRect = window.get_frame_rect();

        this._snappedWindows[zoneId] = this._snappedWindows[zoneId] || [];
        if (!this._snappedWindows[zoneId].includes(window))
            this._snappedWindows[zoneId].push(window);
        this._cycleIndexByZone[zoneId] = (this._snappedWindows[zoneId].length - 1);
        window._autoZonerIsZoned = true;
        window._autoZonerZoneId = zoneId;

        const wa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
        const barHeight = this._settingsManager.getTabBarHeight();
        const minWindowDim = 50; // Minimum dimension for a window
        const zoneGap = this._settingsManager.getZoneGapSize();
        let gapPosOffset = 0;
        let gapSizeReduction = 0;

        if (zoneGap > 0) {
            gapPosOffset = Math.floor(zoneGap / 2);
            gapSizeReduction = zoneGap;
        }

        // Calculate actual zone position and dimensions within the work area
        const slotX = wa.x + zoneDef.x;
        let desiredSlotW = zoneDef.width;
        // Ensure slot width does not exceed monitor boundary from slotX
        let maxAllowableSlotW = (wa.x + wa.width) - slotX;
        let slotW = Math.min(desiredSlotW, maxAllowableSlotW);
        slotW = Math.max(slotW, minWindowDim); // Ensure minimum width

        // Handle Y position and height carefully if zone.y is negative (partially off-screen top)
        const actualZoneYInWorkArea = zoneDef.y; // zoneDef.y is relative to workArea.y
        const clippedZoneYInWorkArea = Math.max(0, actualZoneYInWorkArea); // Clip to 0 if zone.y is negative
        const yClippage = clippedZoneYInWorkArea - actualZoneYInWorkArea; // How much was clipped from the top

        const slotContentY = wa.y + clippedZoneYInWorkArea + barHeight; // Content starts below tab bar
        let desiredSlotH = zoneDef.height - yClippage - barHeight; // Reduce height by clipped amount and tab bar
        // Ensure slot height does not exceed monitor boundary from slotContentY
        let maxAllowableSlotH = (wa.y + wa.height) - slotContentY;
        let slotH = Math.min(desiredSlotH, maxAllowableSlotH);
        slotH = Math.max(slotH, minWindowDim); // Ensure minimum height

        // Apply gaps to the window itself, within the calculated slot
        const gappedWindowX = slotX + gapPosOffset;
        let gappedWindowW = slotW - gapSizeReduction;
        gappedWindowW = Math.max(gappedWindowW, minWindowDim);

        const gappedWindowY = slotContentY + gapPosOffset;
        let gappedWindowH = slotH - gapSizeReduction;
        gappedWindowH = Math.max(gappedWindowH, minWindowDim);

        // Tab bar positioning: should align with the gapped window's visual area if gaps are considered part of the "zone"
        // Or, align with the original zoneDef.x/width and let gaps be inside.
        // Current logic places tab bar at zoneDef.x and gives it zoneDef.width.
        // Let's adjust TabBar position to align with the gapped window for consistency if gaps are present
        const tabBarX = wa.x + zoneDef.x + (zoneGap > 0 ? gapPosOffset : 0); // If gaps, offset tab bar start
        const tabBarY = wa.y + clippedZoneYInWorkArea + (zoneGap > 0 ? gapPosOffset : 0); // Offset if gaps
        const tabBarW = gappedWindowW; // Tab bar width matches gapped window width

        window.move_resize_frame(false, gappedWindowX, gappedWindowY, gappedWindowW, gappedWindowH);

        const tabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef); // zoneDef for overall size
        // Update tab bar position and size based on new calculations
        tabBar.set_position(tabBarX, tabBarY);
        tabBar.set_size(tabBarW, barHeight); // Width matches gapped window, height from settings

        if (!isGrabOpContext) { // Delayed check and re-apply, useful after initial snapping
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 150, () => {
                if (window && typeof window.get_frame_rect === 'function' &&
                    window._autoZonerZoneId === zoneId &&
                    window.get_maximized() === Meta.MaximizeFlags.NONE &&
                    !window.is_fullscreen()) {

                    // Recalculate expected geometry for the check
                    const checkWa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
                    const checkBarHeight = this._settingsManager.getTabBarHeight();
                    const checkZoneGap = this._settingsManager.getZoneGapSize();
                    let chkGapPosOffset = 0;
                    let chkGapSizeReduction = 0;
                    if (checkZoneGap > 0) {
                        chkGapPosOffset = Math.floor(checkZoneGap / 2);
                        chkGapSizeReduction = checkZoneGap;
                    }

                    const chkSlotX = checkWa.x + zoneDef.x;
                    let chkDesiredSlotW = zoneDef.width;
                    let chkMaxAllowableSlotW = (checkWa.x + checkWa.width) - chkSlotX;
                    let chkSlotW = Math.min(chkDesiredSlotW, chkMaxAllowableSlotW);
                    chkSlotW = Math.max(chkSlotW, minWindowDim);

                    const chk_actualZoneYInWorkArea = zoneDef.y;
                    const chk_clippedZoneYInWorkArea = Math.max(0, chk_actualZoneYInWorkArea);
                    const chk_yClippage = chk_clippedZoneYInWorkArea - chk_actualZoneYInWorkArea;
                    const chkSlotContentY = checkWa.y + chk_clippedZoneYInWorkArea + checkBarHeight;
                    let chkDesiredSlotH = zoneDef.height - chk_yClippage - checkBarHeight;
                    let chkMaxAllowableSlotH = (checkWa.y + checkWa.height) - chkSlotContentY;
                    let chkSlotH = Math.min(chkDesiredSlotH, chkMaxAllowableSlotH);
                    chkSlotH = Math.max(chkSlotH, minWindowDim);

                    const chkGappedWindowX = chkSlotX + chkGapPosOffset;
                    let chkGappedWindowW = chkSlotW - chkGapSizeReduction;
                    chkGappedWindowW = Math.max(chkGappedWindowW, minWindowDim);
                    const chkGappedWindowY = chkSlotContentY + chkGapPosOffset;
                    let chkGappedWindowH = chkSlotH - chkGapSizeReduction;
                    chkGappedWindowH = Math.max(chkGappedWindowH, minWindowDim);
                    
                    const currentRect = window.get_frame_rect();
                    if (currentRect.x !== chkGappedWindowX || currentRect.y !== chkGappedWindowY ||
                        currentRect.width !== chkGappedWindowW || currentRect.height !== chkGappedWindowH) {
                        
                        log('_snapWindowToZone[DelayedCheck]', `Window "${window.get_title()}" position/size mismatch. Re-applying.`);
                        window.move_resize_frame(false, chkGappedWindowX, chkGappedWindowY, chkGappedWindowW, chkGappedWindowH);
                        
                        // Also re-apply tab bar position/size if window was corrected
                        const delayedTabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef);
                        const chkTabBarX = checkWa.x + zoneDef.x + (checkZoneGap > 0 ? chkGapPosOffset : 0);
                        const chkTabBarY = checkWa.y + chk_clippedZoneYInWorkArea + (checkZoneGap > 0 ? chkGapPosOffset : 0);
                        const chkTabBarW = chkGappedWindowW;
                        delayedTabBar.set_position(chkTabBarX, chkTabBarY);
                        delayedTabBar.set_size(chkTabBarW, checkBarHeight);
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        }

        tabBar.addWindow(window);
        this._activateWindow(zoneId, window);
    }

    _unsnapWindow(window) {
        const oldZoneId = window._autoZonerZoneId;
        if (!oldZoneId) return;
        log('_unsnapWindow', `Unsnapping "${window.get_title()}" from zone "${oldZoneId}"`);

        if (this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
            const o = window._autoZonerOriginalRect;
            window.move_resize_frame(false, o.x, o.y, o.width, o.height);
            delete window._autoZonerOriginalRect;
        }

        delete window._autoZonerIsZoned;
        delete window._autoZonerZoneId;
        const oldDef = this._settingsManager.getZones()
            .find(z => (z.name || JSON.stringify(z)) === oldZoneId);
        if (oldDef) {
            const tabBar = this._tabBars[oldZoneId];
            if (tabBar) {
                tabBar.removeWindow(window);
            }
        }

        this._snappedWindows[oldZoneId] =
            (this._snappedWindows[oldZoneId] || []).filter(w => w !== window);
        if (this._snappedWindows[oldZoneId] && this._snappedWindows[oldZoneId].length === 0) {
            if (this._tabBars[oldZoneId]) {
                this._tabBars[oldZoneId].destroy();
                delete this._tabBars[oldZoneId];
            }
            delete this._cycleIndexByZone[oldZoneId];
        }
    }

    cycleWindowsInCurrentZone() {
        const focus = global.display.focus_window;
        if (!focus || !focus._autoZonerZoneId) {
            log('cycle', 'No zoned window focused; aborting.');
            return;
        }

        const zoneId = focus._autoZonerZoneId;
        const list = this._snappedWindows[zoneId] || [];
        if (list.length < 2) {
            log('cycle', `Zone "${zoneId}" has ${list.length} window(s); skipping cycle.`);
            return;
        }

        let idx = (this._cycleIndexByZone[zoneId] + 1) % list.length;
        this._cycleIndexByZone[zoneId] = idx;
        const nextWin = list[idx];

        log('cycle', `Cycling to [${idx}] "${nextWin.get_title()}" in zone "${zoneId}".`);
        this._activateWindow(zoneId, nextWin);
    }

    cycleWindowsInCurrentZoneBackward() {
        const focus = global.display.focus_window;
        if (!focus || !focus._autoZonerZoneId) {
            log('cycle-backward', 'No zoned window focused; aborting.');
            return;
        }

        const zoneId = focus._autoZonerZoneId;
        const list = this._snappedWindows[zoneId] || [];
        if (list.length < 2) {
            log('cycle-backward', `Zone "${zoneId}" has ${list.length} window(s); skipping cycle.`);
            return;
        }

        let idx = (this._cycleIndexByZone[zoneId] - 1 + list.length) % list.length;
        this._cycleIndexByZone[zoneId] = idx;
        const prevWin = list[idx];

        log('cycle-backward', `Cycling backward to [${idx}] "${prevWin.get_title()}" in zone "${zoneId}".`);
        this._activateWindow(zoneId, prevWin);
    }

    _activateWindow(zoneId, window) {
        const list = this._snappedWindows[zoneId] || [];
        const currentWindowIndex = list.indexOf(window);
        if (currentWindowIndex !== -1) {
            this._cycleIndexByZone[zoneId] = currentWindowIndex;
        }
        
        const now = global.get_current_time();
        window.activate(now);

        this._tabBars[zoneId]?.highlightWindow(window);
    }

    cleanupWindowProperties() {
        global.get_window_actors().forEach(actor => {
            const w = actor.get_meta_window();
            if (w) {
                delete w._autoZonerIsZoned;
                delete w._autoZonerOriginalRect;
                delete w._autoZonerZoneId;
            }
        });
    }

    updateAllTabAppearances() {
        log('updateAllTabAppearances', 'Requesting update for appearance of all tab bars.');
        for (const zoneId in this._tabBars) {
            const tabBar = this._tabBars[zoneId];
            if (tabBar && typeof tabBar.refreshTabVisuals === 'function') {
                log('updateAllTabAppearances', `Refreshing visuals for tab bar: ${zoneId}`);
                tabBar.refreshTabVisuals();

                // Also need to update the TabBar's own height and position if tab bar height changed
                // Find the zoneDef for this tabBar to correctly reposition/resize it
                const zoneDef = this._settingsManager.getZones().find(z => (z.name || JSON.stringify(z)) === zoneId);
                if (zoneDef) {
                    const wa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
                    const barHeight = this._settingsManager.getTabBarHeight();
                    const zoneGap = this._settingsManager.getZoneGapSize();
                    const gapPosOffset = zoneGap > 0 ? Math.floor(zoneGap / 2) : 0;
                    
                    const clippedZoneYInWorkArea = Math.max(0, zoneDef.y);

                    const tabBarX = wa.x + zoneDef.x + gapPosOffset;
                    const tabBarY = wa.y + clippedZoneYInWorkArea + gapPosOffset;
                    
                    // Recalculate gapped window width for tab bar width
                    const minWindowDim = 50;
                    let slotW = Math.min(zoneDef.width, (wa.x + wa.width) - (wa.x + zoneDef.x));
                    slotW = Math.max(slotW, minWindowDim);
                    let gappedWindowW = slotW - (zoneGap > 0 ? zoneGap : 0);
                    gappedWindowW = Math.max(gappedWindowW, minWindowDim);
                    const tabBarW = gappedWindowW;

                    tabBar.set_position(tabBarX, tabBarY);
                    tabBar.set_size(tabBarW, barHeight);
                    tabBar.set_style(`height: ${barHeight}px;`);
                }
            }
        }
        // After updating individual tab bars, it might be necessary to re-snap windows
        // if tab bar height changes significantly, as it affects content area.
        // This is now handled in extension.js by calling _performDelayedSnap as well.
    }

    destroy() {
        this._disconnectSignals();
        Object.values(this._tabBars).forEach(bar => bar.destroy());
        this._tabBars = {};
        this.cleanupWindowProperties();
        log('destroy', 'Destroyed.');
    }
}
