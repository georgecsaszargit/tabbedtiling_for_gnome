import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js'; // Ensure Main is available for _getMonitorWorkArea

import { ZoneDetector } from './ZoneDetector.js';

const log = (prefix, msg) => console.log(`[AutoZoner.WindowManager.${prefix}] ${msg}`);

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager = settingsManager;
        this._highlightManager = highlightManager;
        this._zoneDetector = new ZoneDetector();
        this._signalConnections = [];
        log('constructor', "Initialized.");
    }

    connectSignals() {
        this._disconnectSignals();

        if (this._settingsManager.isZoningEnabled()) {
            this._connect(global.display, 'grab-op-begin', (d, w, o) => this._onGrabOpBegin(d, w, o));
            this._connect(global.display, 'grab-op-end', (d, w, o) => this._onGrabOpEnd(d, w, o));
            this._connect(global.display, 'window-created', (d, w) => this._onWindowCreated(d, w));
            log('connectSignals', "Event signals connected because zoning is enabled.");
        } else {
            log('connectSignals', "Zoning disabled, event signals not connected.");
        }
    }

    _connect(gobject, signalName, callback) {
        const id = gobject.connect(signalName, callback);
        this._signalConnections.push({ gobject, id });
    }

    _disconnectSignals() {
        this._signalConnections.forEach(conn => {
            try {
                if (conn.gobject && typeof conn.gobject.disconnect === 'function') {
                    if (typeof conn.gobject.is_connected === 'function' && conn.gobject.is_connected(conn.id)) {
                        conn.gobject.disconnect(conn.id);
                    } else if (typeof conn.gobject.is_connected !== 'function') {
                        conn.gobject.disconnect(conn.id);
                    }
                }
            } catch (e) {
                 log('_disconnectSignals', `Error disconnecting signal: ${e}`);
            }
        });
        this._signalConnections = [];
    }


    _getMonitorWorkArea(monitorIndex) {
        if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) {
            return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        }
        return Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    }

    _onGrabOpBegin(display, window, grabOp) {
        log('_onGrabOpBegin', `Window: "${window.get_title()}", GrabOp: ${grabOp}`);
        if ((grabOp & Meta.GrabOp.MOVING) === 0) {
            log('_onGrabOpBegin', "Not a MOVING op, returning.");
            return;
        }
        if (!window || window.get_window_type() !== Meta.WindowType.NORMAL || window.is_fullscreen()) {
            log('_onGrabOpBegin', "Invalid window type or fullscreen, returning.");
            return;
        }

        if (this._highlightManager) this._highlightManager.startUpdating();

        if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect && !window._autoZonerIsZoned) {
            window._autoZonerOriginalRect = window.get_frame_rect();
            log('_onGrabOpBegin', `Stored original rect for "${window.get_title()}": ${JSON.stringify(window._autoZonerOriginalRect)}`);
        }
    }

    _onGrabOpEnd(display, window, grabOp) {
        log('_onGrabOpEnd', `Window: "${window.get_title()}", GrabOp: ${grabOp}`);
        if (this._highlightManager) this._highlightManager.stopUpdating();

        if (!this._settingsManager.isZoningEnabled()) {
            log('_onGrabOpEnd', "Zoning disabled, returning.");
            return;
        }
        if (!window || window.get_window_type() !== Meta.WindowType.NORMAL || window.is_fullscreen()) {
            log('_onGrabOpEnd', `Invalid window type ("${window.get_window_type()}") or fullscreen for "${window.get_title()}", deleting _autoZonerIsZoned and returning.`);
            delete window._autoZonerIsZoned;
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        log('_onGrabOpEnd', `Pointer at X:${pointerX} Y:${pointerY}`);
        const pointerMonitorIndex = global.display.get_monitor_index_for_rect(new Meta.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 }));
        const finalMonitorIndex = (pointerMonitorIndex !== -1) ? pointerMonitorIndex : window.get_monitor();
        log('_onGrabOpEnd', `Final target monitor index: ${finalMonitorIndex}`);


        const zones = this._settingsManager.getZones();
        if (!zones || zones.length === 0) {
            log('_onGrabOpEnd', "No zones defined in settings. Cannot snap.");
            return;
        }

        const targetZone = this._zoneDetector.findTargetZone(zones, {x: pointerX, y: pointerY}, finalMonitorIndex);
        const currentlyZoned = window._autoZonerIsZoned === true;
        log('_onGrabOpEnd', `Target zone: ${targetZone ? JSON.stringify(targetZone) : 'null'}. Currently zoned: ${currentlyZoned}`);

        if (targetZone) {
            if (window.get_maximized()) { // Check if maximized (more direct)
                log('_onGrabOpEnd', `Window "${window.get_title()}" is maximized, unmaximizing.`);
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            }
            const workArea = this._getMonitorWorkArea(finalMonitorIndex);
            const newX = workArea.x + targetZone.x;
            const newY = workArea.y + targetZone.y;

            const currentRect = window.get_frame_rect();
            log('_onGrabOpEnd', `Current rect: ${JSON.stringify(currentRect)}. Target zone rect: X:${newX} Y:${newY} W:${targetZone.width} H:${targetZone.height}`);

            if (currentRect.x === newX && currentRect.y === newY &&
                currentRect.width === targetZone.width && currentRect.height === targetZone.height) {
                log('_onGrabOpEnd', `Window "${window.get_title()}" already in target zone. Marking as zoned.`);
                window._autoZonerIsZoned = true; // Ensure it's marked
                return;
            }

            if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
                 window._autoZonerOriginalRect = { ...currentRect }; // Store current as original if not already stored
                 log('_onGrabOpEnd', `Stored current rect as original for "${window.get_title()}": ${JSON.stringify(window._autoZonerOriginalRect)} before snapping.`);
            }

            log('_onGrabOpEnd', `Moving and resizing "${window.get_title()}" to zone "${targetZone.name || 'Unnamed'}"`);
            window.move_resize_frame(false, newX, newY, targetZone.width, targetZone.height);
            window._autoZonerIsZoned = true;
        } else if (currentlyZoned) {
            log('_onGrabOpEnd', `Window "${window.get_title()}" was zoned but now is not in any zone.`);
            if (this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
                const orig = window._autoZonerOriginalRect;
                log('_onGrabOpEnd', `Restoring "${window.get_title()}" to original rect: ${JSON.stringify(orig)}`);
                window.move_resize_frame(false, orig.x, orig.y, orig.width, orig.height);
                delete window._autoZonerOriginalRect;
            } else {
                log('_onGrabOpEnd', `Not restoring "${window.get_title()}" (either disabled or no original rect).`);
            }
            delete window._autoZonerIsZoned;
        } else {
            log('_onGrabOpEnd', `Window "${window.get_title()}" not in a zone and was not previously zoned. No action.`);
        }

         if (!targetZone && !this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
             // This case implies window was never zoned, but somehow originalRect was set. Clean it up.
            log('_onGrabOpEnd', `Cleaning up stray _autoZonerOriginalRect for "${window.get_title()}"`);
            delete window._autoZonerOriginalRect;
        }
    }

    _onWindowCreated(display, window) {
        log('_onWindowCreated', `Window created: "${window.get_title()}", Type: ${window.get_window_type()}, SkipTaskbar: ${window.skip_taskbar}`);
        if (!this._settingsManager.isZoningEnabled() || !this._settingsManager.isTileNewWindowsEnabled()) {
             log('_onWindowCreated', "Zoning or tileNewWindows disabled, returning.");
            return;
        }

        if (window.get_window_type() === Meta.WindowType.NORMAL && !window.skip_taskbar) {
            // Increased delay slightly to give more time for window to settle its geometry and monitor
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                if (!window || window.is_destroyed()) {
                    log('_onWindowCreated (timeout)', `Window "${window?.get_title()}" destroyed before tiling attempt.`);
                    return GLib.SOURCE_REMOVE;
                }
                log('_onWindowCreated (timeout)', `Attempting to tile new window "${window.get_title()}".`);
                this._tileNewWindow(window);
                return GLib.SOURCE_REMOVE;
            });
        } else {
             log('_onWindowCreated', `Window "${window.get_title()}" not a normal, tileable window.`);
        }
    }

    _tileNewWindow(window) {
        log('_tileNewWindow', `Attempting to tile "${window.get_title()}"`);
        if (!window || window.is_destroyed() || window.is_fullscreen() ||
            window.get_maximized() ) { // Simplified check for maximized
            log('_tileNewWindow', `Window "${window?.get_title()}" not suitable for tiling (destroyed, fullscreen, or maximized).`);
            return;
        }

        const monitorIndex = window.get_monitor();
        const windowRect = window.get_frame_rect();

        log('_tileNewWindow', `Window "${window.get_title()}" Monitor: ${monitorIndex}, Rect: ${JSON.stringify(windowRect)}`);

        if (windowRect.width === 0 || windowRect.height === 0 || monitorIndex === -1) {
            log('_tileNewWindow', `Window "${window.get_title()}" not ready (zero dimensions or no monitor).`);
            return; // Do not attempt to tile if basic geometry isn't set
        }
        const workArea = this._getMonitorWorkArea(monitorIndex);

        const windowCenter = {
            x: windowRect.x + windowRect.width / 2,
            y: windowRect.y + windowRect.height / 2
        };
        log('_tileNewWindow', `Window center for "${window.get_title()}": X:${windowCenter.x} Y:${windowCenter.y}`);

        const zones = this._settingsManager.getZones();
        const targetZone = this._zoneDetector.findTargetZone(zones, windowCenter, monitorIndex);

        if (targetZone) {
             log('_tileNewWindow', `Found target zone "${targetZone.name || 'Unnamed'}" for "${window.get_title()}"`);
             if (this._settingsManager.isRestoreOnUntileEnabled() && !window._autoZonerOriginalRect) {
                 window._autoZonerOriginalRect = { ...windowRect };
                 log('_tileNewWindow', `Stored initial rect as original for "${window.get_title()}": ${JSON.stringify(window._autoZonerOriginalRect)}`);
            }
            window.move_resize_frame(false, workArea.x + targetZone.x, workArea.y + targetZone.y, targetZone.width, targetZone.height);
            window._autoZonerIsZoned = true;
        } else {
            log('_tileNewWindow', `No target zone found for new window "${window.get_title()}".`);
        }
    }

    cleanupWindowProperties() {
        global.get_window_actors().forEach(actor => {
            const window = actor.get_meta_window();
            if (window) {
                delete window._autoZonerIsZoned;
                delete window._autoZonerOriginalRect;
            }
        });
        log('cleanupWindowProperties', "Cleaned up window properties.");
    }

    destroy() {
        this._disconnectSignals();
        log('destroy', "Destroyed.");
    }
}
