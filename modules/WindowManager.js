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

    _getEvasionKeyMask() {
        const keyName = this._settingsManager.getSnapEvasionKeyName();
        switch (keyName?.toLowerCase()) {
            case 'control':
                return Clutter.ModifierType.CONTROL_MASK;
            case 'alt':
                return Clutter.ModifierType.MOD1_MASK;
            case 'shift':
                return Clutter.ModifierType.SHIFT_MASK;
            case 'super':
                return Clutter.ModifierType.MOD4_MASK;
            case 'disabled':
            default:
                return 0; 
        }
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

        const evasionKeyMask = this._getEvasionKeyMask();
        const [, , mods] = global.get_pointer();
        const isEvasionKeyHeld = evasionKeyMask !== 0 && (mods & evasionKeyMask) !== 0;

        delete window._autoZonerEvasionBypass; 

        if (isEvasionKeyHeld) {
            window._autoZonerEvasionBypass = true;
            const keyName = this._settingsManager.getSnapEvasionKeyName();
            log('_onGrabOpBegin', `${keyName} key is held for "${window.get_title()}", bypassing highlights and original rect store.`);
            this._highlightManager?.stopUpdating();
            return; 
        }

        if (!(isMouseMoving || isKeyboardMoving)) {
            log('_onGrabOpBegin', `Operation is not a move (op: ${op}), stopping highlights and skipping further setup.`);
            this._highlightManager?.stopUpdating();
            return;
        }

        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL)
            return;

        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
            window._autoZonerOriginalRect = window.get_frame_rect();
            log('_onGrabOpBegin', `Stored original rect for "${window.get_title()}" during normal move.`);
        }
        this._highlightManager?.startUpdating();
    }

    _onGrabOpEnd(display, window, op) {
        this._highlightManager?.stopUpdating();

        const wasEvasionBypassActiveAtStart = window._autoZonerEvasionBypass;
        delete window._autoZonerEvasionBypass;

        const evasionKeyMask = this._getEvasionKeyMask();
        const [, , modsAtEnd] = global.get_pointer();
        const isEvasionKeyHeldAtEnd = evasionKeyMask !== 0 && (modsAtEnd & evasionKeyMask) !== 0;

        if (isEvasionKeyHeldAtEnd || wasEvasionBypassActiveAtStart) {
            const keyName = this._settingsManager.getSnapEvasionKeyName();
            log('_onGrabOpEnd', `${keyName} key is (or was at start) held for "${window.get_title()}", bypassing snap logic. Window remains at current pos.`);
            if (window._autoZonerIsZoned) {
                this._unsnapWindow(window, /* keepCurrentPosition = */ true);
            } else {
                delete window._autoZonerOriginalRect;
            }
            return;
        }

        if (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING) {
            log('_onGrabOpEnd', `Operation is MOVING or KEYBOARD_MOVING (op: ${op}), proceeding to normal snap logic.`);
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
        const y = wa.y + Math.max(0, zoneDef.y);
        const height = this._settingsManager.getTabBarHeight();
        bar.set_position(x, y);
        bar.set_size(zoneDef.width, height);
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
            const rect = win.get_frame_rect();
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            const mon = win.get_monitor();
            let currentMonitorIndex = mon;
            if (currentMonitorIndex < 0 || currentMonitorIndex >= Main.layoutManager.monitors.length) {
                currentMonitorIndex = Main.layoutManager.primaryIndex;
            }
            let zoneDef = this._zoneDetector.findTargetZone(zones, center, currentMonitorIndex);
            if (!zoneDef) {
                const wa = Main.layoutManager.getWorkAreaForMonitor(currentMonitorIndex);
                let best, bestDist = Infinity;
                zones.filter(z => z.monitorIndex === currentMonitorIndex).forEach(z => {
                    const zx = wa.x + z.x + z.width / 2;
                    const zy = wa.y + z.y + z.height / 2;
                    const dx = zx - center.x, dy = zy - center.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestDist) { bestDist = d2; best = z; }
                });
                zoneDef = best;
            }
            if (zoneDef)
                this._snapWindowToZone(win, zoneDef, false);
        });
    }

    _snapWindowToZone(window, zoneDef, isGrabOpContext = false) {
        const zoneId = zoneDef.name || JSON.stringify(zoneDef);
        const oldZoneId = window._autoZonerZoneId;

        if (oldZoneId && oldZoneId !== zoneId) {
            const oldDef = this._settingsManager.getZones().find(z => (z.name || JSON.stringify(z)) === oldZoneId);
            if (oldDef) {
                this._getZoneTabBar(oldZoneId, oldDef.monitorIndex, oldDef).removeWindow(window);
                this._snappedWindows[oldZoneId] = (this._snappedWindows[oldZoneId] || []).filter(w => w !== window);
            }
        }

        if (window.get_maximized && window.get_maximized())
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        
        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
            // This check assumes _onGrabOpBegin correctly decided not to store if evasion was active.
            // If we reach here, it's a normal snap or a snap initiated not from a grab op where evasion matters.
            window._autoZonerOriginalRect = window.get_frame_rect();
            log('_snapWindowToZone', `Stored original rect for "${window.get_title()}"`);
        }

        this._snappedWindows[zoneId] = this._snappedWindows[zoneId] || [];
        if (!this._snappedWindows[zoneId].includes(window))
            this._snappedWindows[zoneId].push(window);
        this._cycleIndexByZone[zoneId] = (this._snappedWindows[zoneId].length - 1);
        window._autoZonerIsZoned = true;
        window._autoZonerZoneId = zoneId;

        const wa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
        const barHeight = this._settingsManager.getTabBarHeight();
        const minWindowDim = 50;
        const zoneGap = this._settingsManager.getZoneGapSize();
        let gapPosOffset = 0; let gapSizeReduction = 0;
        if (zoneGap > 0) { gapPosOffset = Math.floor(zoneGap / 2); gapSizeReduction = zoneGap; }

        const slotX = wa.x + zoneDef.x;
        let slotW = Math.min(zoneDef.width, (wa.x + wa.width) - slotX);
        slotW = Math.max(slotW, minWindowDim);
        const actualZoneYInWorkArea = zoneDef.y;
        const clippedZoneYInWorkArea = Math.max(0, actualZoneYInWorkArea);
        const yClippage = clippedZoneYInWorkArea - actualZoneYInWorkArea;
        const slotContentY = wa.y + clippedZoneYInWorkArea + barHeight;
        let slotH = Math.min(zoneDef.height - yClippage - barHeight, (wa.y + wa.height) - slotContentY);
        slotH = Math.max(slotH, minWindowDim);

        const gappedWindowX = slotX + gapPosOffset;
        let gappedWindowW = Math.max(slotW - gapSizeReduction, minWindowDim);
        const gappedWindowY = slotContentY + gapPosOffset;
        let gappedWindowH = Math.max(slotH - gapSizeReduction, minWindowDim);
        const tabBarX = wa.x + zoneDef.x + (zoneGap > 0 ? gapPosOffset : 0);
        const tabBarY = wa.y + clippedZoneYInWorkArea + (zoneGap > 0 ? gapPosOffset : 0);
        const tabBarW = gappedWindowW;

        window.move_resize_frame(false, gappedWindowX, gappedWindowY, gappedWindowW, gappedWindowH);
        const tabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef);
        tabBar.set_position(tabBarX, tabBarY);
        tabBar.set_size(tabBarW, barHeight);

        if (!isGrabOpContext) { 
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 150, () => {
                if (window && typeof window.get_frame_rect === 'function' &&
                    window._autoZonerZoneId === zoneId && !window.is_fullscreen() &&
                    window.get_maximized() === Meta.MaximizeFlags.NONE) {
                    const currentRect = window.get_frame_rect();
                    if (currentRect.x !== gappedWindowX || currentRect.y !== gappedWindowY ||
                        currentRect.width !== gappedWindowW || currentRect.height !== gappedWindowH) {
                        log('_snapWindowToZone[DelayedCheck]', `Window "${window.get_title()}" mismatch. Re-applying.`);
                        window.move_resize_frame(false, gappedWindowX, gappedWindowY, gappedWindowW, gappedWindowH);
                        const delayedTabBar = this._getZoneTabBar(zoneId, zoneDef.monitorIndex, zoneDef);
                        delayedTabBar.set_position(tabBarX, tabBarY);
                        delayedTabBar.set_size(tabBarW, barHeight);
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        }
        tabBar.addWindow(window);
        this._activateWindow(zoneId, window);
    }

    _unsnapWindow(window, keepCurrentPosition = false) {
        const oldZoneId = window._autoZonerZoneId;
        
        // Only proceed if it was actually zoned OR if we're explicitly keeping position (e.g. Ctrl-drag of a non-zoned window needs its OriginalRect cleared)
        if (!oldZoneId && !keepCurrentPosition) {
            return; 
        }
        log('_unsnapWindow', `Unsnapping "${window.get_title()}" from zone "${oldZoneId || 'N/A'}". keepCurrentPosition=${keepCurrentPosition}`);

        if (!keepCurrentPosition && this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
            const o = window._autoZonerOriginalRect;
            window.move_resize_frame(false, o.x, o.y, o.width, o.height);
            delete window._autoZonerOriginalRect; 
        } else if (keepCurrentPosition) {
            delete window._autoZonerOriginalRect;
        }

        if (oldZoneId) { 
            delete window._autoZonerIsZoned;
            delete window._autoZonerZoneId;

            const oldDef = this._settingsManager.getZones().find(z => (z.name || JSON.stringify(z)) === oldZoneId);
            if (oldDef) {
                const tabBar = this._tabBars[oldZoneId];
                if (tabBar) {
                    tabBar.removeWindow(window);
                }
            }
            this._snappedWindows[oldZoneId] = (this._snappedWindows[oldZoneId] || []).filter(w => w !== window);
            if (this._snappedWindows[oldZoneId] && this._snappedWindows[oldZoneId].length === 0) {
                if (this._tabBars[oldZoneId]) {
                    this._tabBars[oldZoneId].destroy();
                    delete this._tabBars[oldZoneId];
                }
                delete this._cycleIndexByZone[oldZoneId];
            }
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
                delete w._autoZonerEvasionBypass; 
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
                const zoneDef = this._settingsManager.getZones().find(z => (z.name || JSON.stringify(z)) === zoneId);
                if (zoneDef) {
                    const wa = Main.layoutManager.getWorkAreaForMonitor(zoneDef.monitorIndex);
                    const barHeight = this._settingsManager.getTabBarHeight();
                    const zoneGap = this._settingsManager.getZoneGapSize();
                    const gapPosOffset = zoneGap > 0 ? Math.floor(zoneGap / 2) : 0;
                    const clippedZoneYInWorkArea = Math.max(0, zoneDef.y);
                    const tabBarX = wa.x + zoneDef.x + gapPosOffset;
                    const tabBarY = wa.y + clippedZoneYInWorkArea + gapPosOffset;
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
    }

    destroy() {
        this._disconnectSignals();
        Object.values(this._tabBars).forEach(bar => bar.destroy());
        this._tabBars = {};
        this.cleanupWindowProperties();
        log('destroy', 'Destroyed.');
    }
}
