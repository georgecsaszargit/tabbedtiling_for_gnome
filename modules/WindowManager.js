import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneDetector } from './ZoneDetector.js';

const log = (p, msg) => console.log(`[AutoZoner.WindowManager.${p}] ${msg}`);

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager    = settingsManager;
        this._highlightManager   = highlightManager;
        this._zoneDetector       = new ZoneDetector();
        this._signalConnections  = [];

        // NEW: tracking snapped windows per zone
        this._snappedWindows     = {};  // { zoneId: [metaWindow, …] }
        this._cycleIndexByZone   = {};  // { zoneId: currentIndex }
        this._currentZoneId      = null;

        log('constructor', 'Initialized.');
    }

    connectSignals() {
        this._disconnectSignals();

        if (!this._settingsManager.isZoningEnabled()) {
            log('connectSignals', 'Zoning disabled, skipping signals.');
            return;
        }

        this._connect(global.display, 'grab-op-begin', (d, w, o) => this._onGrabOpBegin(d, w, o));
        this._connect(global.display, 'grab-op-end',   (d, w, o) => this._onGrabOpEnd(d, w, o));
        this._connect(global.display, 'window-created',(d, w)   => this._onWindowCreated(d, w));

        log('connectSignals', 'Signals connected.');
    }

    _connect(gobj, name, cb) {
        const id = gobj.connect(name, cb);
        this._signalConnections.push({ gobj, id });
    }

    _disconnectSignals() {
        this._signalConnections.forEach(({ gobj, id }) => {
            try {
                if (gobj.is_connected && gobj.is_connected(id))
                    gobj.disconnect(id);
                else if (gobj.disconnect)
                    gobj.disconnect(id);
            } catch (e) {
                log('_disconnectSignals', `Error: ${e}`);
            }
        });
        this._signalConnections = [];
    }

    _getMonitorWorkArea(mon) {
        const lm = Main.layoutManager;
        if (mon < 0 || mon >= lm.monitors.length)
            return lm.getWorkAreaForMonitor(lm.primaryIndex);
        return lm.getWorkAreaForMonitor(mon);
    }

    _onGrabOpBegin(display, window, op) {
        if ((op & Meta.GrabOp.MOVING) === 0) return;
        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) return;

        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
            window._autoZonerOriginalRect = window.get_frame_rect();
            log('_onGrabOpBegin', `Stored original rect for "${window.get_title()}"`);
        }

        if (this._highlightManager)
            this._highlightManager.startUpdating();
    }

    _onGrabOpEnd(display, window, op) {
        if (this._highlightManager)
            this._highlightManager.stopUpdating();

        if (!this._settingsManager.isZoningEnabled()) return;
        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL) {
            delete window._autoZonerIsZoned;
            return;
        }

        const { x, y, width, height } = window.get_frame_rect();
        const center = { x: x + width/2, y: y + height/2 };
        const mon = window.get_monitor();
        const zones = this._settingsManager.getZones();
        const targetZone = this._zoneDetector.findTargetZone(zones, center, mon);

        if (targetZone) {
            // Unmaximize if needed
            if (window.get_maximized())
                window.unmaximize(Meta.MaximizeFlags.BOTH);

            const workArea = this._getMonitorWorkArea(mon);
            const newX = workArea.x + targetZone.x;
            const newY = workArea.y + targetZone.y;

            // Track this window in the zone
            const zoneId = targetZone.name || JSON.stringify(targetZone);
            this._snappedWindows[zoneId] = this._snappedWindows[zoneId] || [];
            if (!this._snappedWindows[zoneId].includes(window))
                this._snappedWindows[zoneId].push(window);

            this._currentZoneId          = zoneId;
            this._cycleIndexByZone[zoneId] = 0;

            window.move_resize_frame(false, newX, newY, targetZone.width, targetZone.height);
            window._autoZonerIsZoned = true;
            log('_onGrabOpEnd', `Snapped "${window.get_title()}" into zone "${zoneId}"`);
        }
        else if (window._autoZonerIsZoned) {
            // Untile / restore
            if (this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
                const o = window._autoZonerOriginalRect;
                window.move_resize_frame(false, o.x, o.y, o.width, o.height);
                delete window._autoZonerOriginalRect;
                log('_onGrabOpEnd', `Restored "${window.get_title()}"`);
            }
            delete window._autoZonerIsZoned;
        }
    }

    // NEW: Cycle through windows in the current zone
    cycleWindowsInCurrentZone() {
        const id = this._currentZoneId;
        const list = this._snappedWindows[id] || [];
        if (list.length < 2) return;

        let idx = (this._cycleIndexByZone[id] + 1) % list.length;
        this._cycleIndexByZone[id] = idx;

        const nextWin = list[idx];
        if (nextWin && !nextWin.minimized) {
            nextWin.activate(global.get_current_time());
        }
    }

    cleanupWindowProperties() {
        global.get_window_actors().forEach(actor => {
            const w = actor.get_meta_window();
            if (w) {
                delete w._autoZonerIsZoned;
                delete w._autoZonerOriginalRect;
            }
        });
    }

    destroy() {
        this._disconnectSignals();
        log('destroy', 'Destroyed.');
    }
}

