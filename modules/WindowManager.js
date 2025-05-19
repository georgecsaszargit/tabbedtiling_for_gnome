// modules/WindowManager.js

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneDetector } from './ZoneDetector.js';
import { TabBar }       from './TabBar.js';

const log = (context, msg) => console.log(`[AutoZoner.WindowManager.${context}] ${msg}`);

const ZONE_GAP = 5; // Hardcoded 5px gap
const GAP_POS_OFFSET = Math.floor(ZONE_GAP / 2); // Offset for position (e.g., 2px for 5px gap)
const GAP_SIZE_REDUCTION = ZONE_GAP; // Total reduction for size (e.g., 5px for 5px gap)

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager  = settingsManager;
        this._highlightManager = highlightManager;
        this._zoneDetector     = new ZoneDetector();
        this._signalConnections = [];

        this._snappedWindows    = {};  // zoneId → [Meta.Window]
        this._cycleIndexByZone  = {};  // zoneId → current index
        this._tabBars           = {};  // zoneId → TabBar instance
    }

    connectSignals() {
        this._disconnectSignals();
        if (!this._settingsManager.isZoningEnabled()) {
            log('connectSignals', 'Zoning disabled.');
            return;
        }
        this._connect(global.display, 'grab-op-begin',  (d, w, o) => this._onGrabOpBegin(d, w, o));
        this._connect(global.display, 'grab-op-end',    (d, w, o) => this._onGrabOpEnd(d, w, o));
        this._connect(global.display, 'window-created', (d, w)    => this._onWindowCreated(d, w));
        log('connectSignals', 'Signals connected.');
    }

    _connect(gobj, name, cb) {
        const id = gobj.connect(name, cb);
        this._signalConnections.push({ gobj, id });
    }

    _disconnectSignals() {
        this._signalConnections.forEach(({ gobj, id }) => {
            try { gobj.disconnect(id); } catch {}
        });
        this._signalConnections = [];
    }

    _onWindowCreated(display, window) {
        if (!this._settingsManager.isZoningEnabled() ||
            !this._settingsManager.isTileNewWindowsEnabled())
            return;

        if (window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 100, () => { // Increased delay slightly for stability
            if (window.is_destroyed()) return GLib.SOURCE_REMOVE;

            const rect   = window.get_frame_rect();
            const center = { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
            const mon    = window.get_monitor();
            const zones  = this._settingsManager.getZones();
            const zoneDef = this._zoneDetector.findTargetZone(zones, center, mon);
            if (zoneDef) {
                this._snapWindowToZone(window, zoneDef, false); // isGrabOpContext = false
                log('_onWindowCreated', `Auto-snapped "${window.get_title()}" into "${zoneDef.name || JSON.stringify(zoneDef)}"`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _onGrabOpBegin(display, window, op) {
        if ((op & Meta.GrabOp.MOVING) === 0) return;
        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL)
            return;
        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
            window._autoZonerOriginalRect = window.get_frame_rect();
            log('_onGrabOpBegin', `Stored original rect for "${window.get_title()}"`);
        }
        this._highlightManager?.startUpdating();
    }

    _onGrabOpEnd(display, window, op) {
        this._highlightManager?.stopUpdating();
        if (!this._settingsManager.isZoningEnabled()) return;

        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) {
            this._unsnapWindow(window);
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const hitRect = new Meta.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 });
        let mon = global.display.get_monitor_index_for_rect(hitRect);
        if (mon < 0)
            mon = window.get_monitor(); // Fallback to window's current monitor
        
        // Ensure mon is valid, fallback to primary if necessary
        if (mon < 0 || mon >= Main.layoutManager.monitors.length) {
            mon = Main.layoutManager.primaryIndex;
        }

        const center = { x: pointerX, y: pointerY };
        const zones  = this._settingsManager.getZones();
        const zoneDef = this._zoneDetector.findTargetZone(zones, center, mon);

        if (zoneDef) {
            this._snapWindowToZone(window, zoneDef, true); // isGrabOpContext = true
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
        // Default positioning might be overridden later by _snapWindowToZone for gapping.
        // For now, keep its own understanding of base position and size.
        const wa       = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        const x        = wa.x + zoneDef.x; // Initial X based on zoneDef
        const y        = wa.y + Math.max(0, zoneDef.y); // Initial Y, clipped to workArea
        const height   = this._settingsManager.getTabBarHeight();

        bar.set_position(x, y); // This will be refined by the caller for gapping
        bar.set_size(zoneDef.width, height); // This will be refined by the caller
        bar.set_style(`height: ${height}px;`);

        return bar;
    }

    snapAllWindowsToZones() {
        if (!this._settingsManager.isZoningEnabled()) return;
        const zones = this._settingsManager.getZones();

        global.get_window_actors().forEach(actor => {
            const win = actor.get_meta_window();
            if (!win || win.is_fullscreen() || win.get_window_type() !== Meta.WindowType.NORMAL)
                return;

            const rect   = win.get_frame_rect();
            const center = { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
            const mon    = win.get_monitor();
            
            let currentMonitorIndex = mon;
            if (currentMonitorIndex < 0 || currentMonitorIndex >= Main.layoutManager.monitors.length) {
                 currentMonitorIndex = Main.layoutManager.primaryIndex;
            }

            let zoneDef = this._zoneDetector.findTargetZone(zones, center, currentMonitorIndex);
            if (!zoneDef) { // Fallback: find closest zone on the window's monitor
                const wa = Main.layoutManager.getWorkAreaForMonitor(currentMonitorIndex);
                let best, bestDist = Infinity;
                zones.filter(z => z.monitorIndex === currentMonitorIndex).forEach(z => {
                    const zx = wa.x + z.x + z.width/2;
                    const zy = wa.y + z.y + z.height/2; // Zone center
                    const dx = zx - center.x, dy = zy - center.y;
                    const d2 = dx*dx + dy*dy;
                    if (d2 < bestDist) { bestDist = d2; best = z; }
                });
                zoneDef = best;
            }

            if (zoneDef)
                this._snapWindowToZone(win, zoneDef, false); // isGrabOpContext = false
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
        this._cycleIndexByZone[zoneId] = (this._snappedWindows[zoneId].length - 1); // New window goes to end of cycle
        window._autoZonerIsZoned = true;
        window._autoZonerZoneId  = zoneId;

        const wa             = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
        const barHeight      = this._settingsManager.getTabBarHeight();
        const minWindowDim   = 50; // Minimum width and height for a window

        // --- Original Slot Calculations (X and Width) ---
        const slotX = wa.x + zoneDef.x;
        let desiredSlotW = zoneDef.width;
        let maxAllowableSlotW = (wa.x + wa.width) - slotX;
        let slotW = Math.min(desiredSlotW, maxAllowableSlotW);
        slotW = Math.max(slotW, minWindowDim);

        // --- Original Slot Calculations (Y and Height, for window content area) ---
        const actualZoneYInWorkArea = zoneDef.y;
        const clippedZoneYInWorkArea = Math.max(0, actualZoneYInWorkArea);
        const yClippage = clippedZoneYInWorkArea - actualZoneYInWorkArea; // This is >= 0

        // Y where window content would start, after tab bar
        const slotContentY = wa.y + clippedZoneYInWorkArea + barHeight;
        // Height available for window content
        let desiredSlotH = zoneDef.height - yClippage - barHeight;
        let maxAllowableSlotH = (wa.y + wa.height) - slotContentY;
        let slotH = Math.min(desiredSlotH, maxAllowableSlotH);
        slotH = Math.max(slotH, minWindowDim);

        // --- Apply Gaps ---
        // Window position and size with gaps
        const gappedWindowX = slotX + GAP_POS_OFFSET;
        let gappedWindowW = slotW - GAP_SIZE_REDUCTION;
        gappedWindowW = Math.max(gappedWindowW, minWindowDim);

        const gappedWindowY = slotContentY + GAP_POS_OFFSET; // Gap between tabBar and window
        let gappedWindowH = slotH - GAP_SIZE_REDUCTION; // Reduce for top & bottom gap in content area
        gappedWindowH = Math.max(gappedWindowH, minWindowDim);

        // TabBar position and size with gaps
        // TabBar Y: Gap from top of workArea (or clipped zone top)
        const tabBarX = wa.x + zoneDef.x + GAP_POS_OFFSET;
        const tabBarY = wa.y + clippedZoneYInWorkArea + GAP_POS_OFFSET;
        const tabBarW = gappedWindowW; // Tab bar width matches the gapped window width
        // barHeight is already known

        window.move_resize_frame(false, gappedWindowX, gappedWindowY, gappedWindowW, gappedWindowH);

        const tabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef);
        tabBar.set_position(tabBarX, tabBarY);
        tabBar.set_size(tabBarW, barHeight); // Use actual barHeight from settings


        if (!isGrabOpContext) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 150, () => {
                if (window && !window.is_destroyed() && window._autoZonerZoneId === zoneId &&
                    window.get_maximized() === Meta.MaximizeFlags.NONE && !window.is_fullscreen()) {
                    
                    const currentRect = window.get_frame_rect();
                    
                    const checkWa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
                    const checkBarHeight = this._settingsManager.getTabBarHeight();

                    // --- Recalculate Original Slot for Check ---
                    const checkSlotX = checkWa.x + zoneDef.x;
                    let desiredCheckSlotW = zoneDef.width;
                    let maxAllowableCheckSlotW = (checkWa.x + checkWa.width) - checkSlotX;
                    let checkSlotW = Math.min(desiredCheckSlotW, maxAllowableCheckSlotW);
                    checkSlotW = Math.max(checkSlotW, minWindowDim);

                    const check_actualZoneYInWorkArea = zoneDef.y;
                    const check_clippedZoneYInWorkArea = Math.max(0, check_actualZoneYInWorkArea);
                    const check_yClippage = check_clippedZoneYInWorkArea - check_actualZoneYInWorkArea;
                    
                    const checkSlotContentY = checkWa.y + check_clippedZoneYInWorkArea + checkBarHeight;
                    let desiredCheckSlotH = zoneDef.height - check_yClippage - checkBarHeight;
                    let maxAllowableCheckSlotH = (checkWa.y + checkWa.height) - checkSlotContentY;
                    let checkSlotH = Math.min(desiredCheckSlotH, maxAllowableCheckSlotH);
                    checkSlotH = Math.max(checkSlotH, minWindowDim);

                    // --- Apply Gaps for Check ---
                    const checkGappedWindowX = checkSlotX + GAP_POS_OFFSET;
                    let checkGappedWindowW = checkSlotW - GAP_SIZE_REDUCTION;
                    checkGappedWindowW = Math.max(checkGappedWindowW, minWindowDim);

                    const checkGappedWindowY = checkSlotContentY + GAP_POS_OFFSET;
                    let checkGappedWindowH = checkSlotH - GAP_SIZE_REDUCTION;
                    checkGappedWindowH = Math.max(checkGappedWindowH, minWindowDim);
                    
                    // TabBar check geometry
                    const checkTabBarX = checkWa.x + zoneDef.x + GAP_POS_OFFSET;
                    const checkTabBarY = checkWa.y + check_clippedZoneYInWorkArea + GAP_POS_OFFSET;
                    const checkTabBarW = checkGappedWindowW;


                    if (currentRect.x !== checkGappedWindowX || currentRect.y !== checkGappedWindowY ||
                        currentRect.width !== checkGappedWindowW || currentRect.height !== checkGappedWindowH) {
                        
                        log('_snapWindowToZone[DelayedCheck]', `Window "${window.get_title()}" position/size mismatch. Re-applying.`);
                        window.move_resize_frame(false, checkGappedWindowX, checkGappedWindowY, checkGappedWindowW, checkGappedWindowH);
                        
                        const delayedTabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef);
                        delayedTabBar.set_position(checkTabBarX, checkTabBarY);
                        delayedTabBar.set_size(checkTabBarW, checkBarHeight);
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

        if (this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
            const o = window._autoZonerOriginalRect;
            window.move_resize_frame(false, o.x, o.y, o.width, o.height);
            delete window._autoZonerOriginalRect;
        }

        delete window._autoZonerIsZoned;
        delete window._autoZonerZoneId;

        const oldDef = this._settingsManager.getZones()
                                     .find(z => (z.name || JSON.stringify(z)) === oldZoneId);
        if (oldDef) { // Check if oldDef is found before trying to access its properties
            const tabBar = this._tabBars[oldZoneId]; // Get existing tab bar if any
            if (tabBar) {
                 tabBar.removeWindow(window);
            }
        }

        this._snappedWindows[oldZoneId] =
            (this._snappedWindows[oldZoneId] || []).filter(w => w !== window);
        
        // If zone becomes empty, destroy its tab bar
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
        const list   = this._snappedWindows[zoneId] || [];
        if (list.length < 2) {
            log('cycle', `Zone "${zoneId}" has ${list.length} window(s); skipping.`);
            return;
        }

        let idx = (this._cycleIndexByZone[zoneId] + 1) % list.length;
        this._cycleIndexByZone[zoneId] = idx;
        const nextWin = list[idx];

        log('cycle', `Animating to [${idx}] "${nextWin.get_title()}" in zone "${zoneId}".`);
        this._activateWindow(zoneId, nextWin); // Also handles animation and raising
    }

    cycleWindowsInCurrentZoneBackward() {
        const focus = global.display.focus_window;
        if (!focus || !focus._autoZonerZoneId) {
            log('cycle-backward', 'No zoned window focused; aborting.');
            return;
        }

        const zoneId = focus._autoZonerZoneId;
        const list   = this._snappedWindows[zoneId] || [];
        if (list.length < 2) {
            log('cycle-backward', `Zone "${zoneId}" has ${list.length} window(s); skipping.`);
            return;
        }

        let idx = (this._cycleIndexByZone[zoneId] - 1 + list.length) % list.length;
        this._cycleIndexByZone[zoneId] = idx;
        const prevWin = list[idx];

        log('cycle-backward', `Animating backward to [${idx}] "${prevWin.get_title()}" in zone "${zoneId}".`);
        this._activateWindow(zoneId, prevWin); // Also handles animation and raising
    }

    _activateWindow(zoneId, window) {
        // Find current index of this window for cycle memory
        const list = this._snappedWindows[zoneId] || [];
        const currentWindowIndex = list.indexOf(window);
        if (currentWindowIndex !== -1) {
            this._cycleIndexByZone[zoneId] = currentWindowIndex;
        }
        
        const actor = global.get_window_actors().find(a => a.get_meta_window() === window);
        if (actor) {
            // Simple raise, activation will bring to front
        }
        
        const now = global.get_current_time();
        window.activate(now); // This should raise it as well

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

    destroy() {
        this._disconnectSignals();
        Object.values(this._tabBars).forEach(bar => bar.destroy());
        this._tabBars = {};
        log('destroy', 'Destroyed.');
    }
}
