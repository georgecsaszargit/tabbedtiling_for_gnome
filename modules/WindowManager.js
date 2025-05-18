// modules/WindowManager.js

import Meta    from 'gi://Meta';
import GLib    from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneDetector } from './ZoneDetector.js';

const log = (p, msg) => console.log(`[AutoZoner.WindowManager.${p}] ${msg}`);

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager   = settingsManager;
        this._highlightManager  = highlightManager;
        this._zoneDetector      = new ZoneDetector();
        this._signalConnections = [];

        // windows grouped by zoneId, and cycle indices
        this._snappedWindows    = {};
        this._cycleIndexByZone  = {};

        log('constructor', 'Initialized.');
    }

    connectSignals() {
        this._disconnectSignals();

        if (!this._settingsManager.isZoningEnabled()) {
            log('connectSignals', 'Zoning disabled.');
            return;
        }

        this._connect(global.display, 'grab-op-begin',  (d, w, o) => this._onGrabOpBegin(d, w, o));
        this._connect(global.display, 'grab-op-end',    (d, w, o) => this._onGrabOpEnd(d, w, o));
        this._connect(global.display, 'window-created', (d, w)   => this._onWindowCreated(d, w));

        log('connectSignals', 'Signals connected.');
    }

    _onWindowCreated(display, window) {
        // stub
    }

    _connect(gobj, name, cb) {
        const id = gobj.connect(name, cb);
        this._signalConnections.push({ gobj, id });
    }

    _disconnectSignals() {
        this._signalConnections.forEach(({ gobj, id }) => {
            try {
                if (gobj.is_connected?.(id))
                    gobj.disconnect(id);
                else
                    gobj.disconnect(id);
            } catch (e) {
                log('_disconnectSignals', `Error: ${e}`);
            }
        });
        this._signalConnections = [];
    }

    _getMonitorWorkArea(mon) {
        const lm = Main.layoutManager;
        return (mon < 0 || mon >= lm.monitors.length)
            ? lm.getWorkAreaForMonitor(lm.primaryIndex)
            : lm.getWorkAreaForMonitor(mon);
    }

    _onGrabOpBegin(display, window, op) {
        if ((op & Meta.GrabOp.MOVING) === 0) return;
        if (!window || window.is_fullscreen() || window.get_window_type() !== Meta.WindowType.NORMAL)
            return;

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
            delete window._autoZonerZoneId;
            return;
        }

        const { x, y, width, height } = window.get_frame_rect();
        const center = { x: x + width/2, y: y + height/2 };
        const mon     = window.get_monitor();
        const zones   = this._settingsManager.getZones();
        const targetZone = this._zoneDetector.findTargetZone(zones, center, mon);

        if (targetZone) {
            if (window.get_maximized())
                window.unmaximize(Meta.MaximizeFlags.BOTH);

            const wa    = this._getMonitorWorkArea(mon);
            const newX  = wa.x + targetZone.x;
            const newY  = wa.y + targetZone.y;
            const zoneId = targetZone.name || JSON.stringify(targetZone);

            // Remove from other zones
            for (const zid of Object.keys(this._snappedWindows)) {
                this._snappedWindows[zid] =
                    this._snappedWindows[zid].filter(w => w !== window);
            }

            // Add to this zone
            this._snappedWindows[zoneId] = this._snappedWindows[zoneId] || [];
            this._snappedWindows[zoneId].push(window);

            // Tag + reset index
            window._autoZonerZoneId       = zoneId;
            this._cycleIndexByZone[zoneId] = 0;

            window.move_resize_frame(false, newX, newY, targetZone.width, targetZone.height);
            window._autoZonerIsZoned = true;
            log('_onGrabOpEnd', `Snapped "${window.get_title()}" into zone "${zoneId}"`);
        }
        else if (window._autoZonerIsZoned) {
            if (this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
                const o = window._autoZonerOriginalRect;
                window.move_resize_frame(false, o.x, o.y, o.width, o.height);
                delete window._autoZonerOriginalRect;
                log('_onGrabOpEnd', `Restored "${window.get_title()}"`);
            }
            delete window._autoZonerIsZoned;
            delete window._autoZonerZoneId;
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

        // Advance & wrap index
        let idx = (this._cycleIndexByZone[zoneId] + 1) % list.length;
        this._cycleIndexByZone[zoneId] = idx;
        const nextWin = list[idx];

        log('cycle', `Animating to [${idx}] "${nextWin.get_title()}" in zone "${zoneId}".`);

        // Find the actor for that window
        const actor = global.get_window_actors()
            .find(a => a.get_meta_window() === nextWin);
        if (actor) {
            // Slide in from off-screen bottom
            const mon  = nextWin.get_monitor();
            const wa   = Main.layoutManager.getWorkAreaForMonitor(mon);
            const finalY = actor.get_y();
            actor.set_y(wa.y + wa.height + 10);
            actor.ease({
                y:        finalY,
                duration: 300,
                mode:     Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        // Finally activate
        nextWin.activate(global.get_current_time());
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
        log('destroy', 'Destroyed.');
    }
}

