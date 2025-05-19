// modules/WindowManager.js

import Meta    from 'gi://Meta';
import GLib    from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneDetector } from './ZoneDetector.js';
import { TabBar }       from './TabBar.js';

const log = (p, msg) => console.log(`[AutoZoner.WindowManager.${p}] ${msg}`);

export class WindowManager {
    constructor(settingsManager, highlightManager) {
        this._settingsManager   = settingsManager;
        this._highlightManager  = highlightManager;
        this._zoneDetector      = new ZoneDetector();
        this._signalConnections = [];

        this._snappedWindows    = {};  // zoneId → [windows]
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
        this._connect(global.display, 'window-created', (d, w)   => this._onWindowCreated(d, w));
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
        // stub
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

    _getZoneTabBar(zoneId, monitorIndex, zoneDef) {
        let bar = this._tabBars[zoneId];
        if (!bar) {
            bar = new TabBar(zoneId, (win) => this._activateWindow(zoneId, win), this._settingsManager);
            this._tabBars[zoneId] = bar;
            Main.uiGroup.add_child(bar);
        }
        const wa     = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        const x      = wa.x + zoneDef.x;
        const y      = wa.y;
        const height = this._settingsManager.getTabBarHeight();

        bar.set_position(x, y);
        bar.set_size(zoneDef.width, height);
        bar.set_style(`height: ${height}px;`);

        return bar;
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
        const center    = { x: x + width/2, y: y + height/2 };
        const mon       = window.get_monitor();
        const zones     = this._settingsManager.getZones();
        const targetZone = this._zoneDetector.findTargetZone(zones, center, mon);

        if (targetZone) {
            const zoneId = targetZone.name || JSON.stringify(targetZone);

            // If moving from another zone, remove its tab there first
            const oldZoneId = window._autoZonerZoneId;
            if (oldZoneId && oldZoneId !== zoneId) {
                const oldZoneDef = zones.find(z =>
                    (z.name || JSON.stringify(z)) === oldZoneId
                );
                if (oldZoneDef)
                    this._getZoneTabBar(oldZoneId, oldZoneDef.monitorIndex, oldZoneDef)
                        .removeWindow(window);
            }

            if (window.get_maximized())
                window.unmaximize(Meta.MaximizeFlags.BOTH);

            const wa           = Main.layoutManager.getWorkAreaForMonitor(mon);
            const barHeight    = this._settingsManager.getTabBarHeight();
            const newX         = wa.x + targetZone.x;
            const newY         = wa.y + targetZone.y + barHeight;
            const newHeight    = targetZone.height - barHeight;

            // Remove from any other snapped lists
            Object.keys(this._snappedWindows).forEach(zid => {
                this._snappedWindows[zid] =
                    this._snappedWindows[zid].filter(w => w !== window);
            });

            // Add to this zone
            this._snappedWindows[zoneId] = this._snappedWindows[zoneId] || [];
            this._snappedWindows[zoneId].push(window);
            this._cycleIndexByZone[zoneId] = 0;
            window._autoZonerIsZoned = true;
            window._autoZonerZoneId  = zoneId;

            // Resize & move below tab bar
            window.move_resize_frame(
                false,
                newX, newY,
                targetZone.width, newHeight
            );

            // Update this zone's tab bar
            const tabBar = this._getZoneTabBar(zoneId, mon, targetZone);
            tabBar.addWindow(window);

            log('_onGrabOpEnd', `Snapped "${window.get_title()}" into zone "${zoneId}"`);
        }
        else if (window._autoZonerIsZoned) {
            // Leaving all zones: remove tab and restore
            const oldZoneId = window._autoZonerZoneId;
            if (this._settingsManager.isRestoreOnUntileEnabled() && window._autoZonerOriginalRect) {
                const o = window._autoZonerOriginalRect;
                window.move_resize_frame(false, o.x, o.y, o.width, o.height);
                delete window._autoZonerOriginalRect;
                log('_onGrabOpEnd', `Restored "${window.get_title()}"`);
            }

            delete window._autoZonerIsZoned;
            delete window._autoZonerZoneId;

            this._snappedWindows[oldZoneId] =
                (this._snappedWindows[oldZoneId] || []).filter(w => w !== window);

            const oldZoneDef = zones.find(z =>
                (z.name || JSON.stringify(z)) === oldZoneId
            );
            if (oldZoneDef)
                this._getZoneTabBar(oldZoneId, oldZoneDef.monitorIndex, oldZoneDef)
                    .removeWindow(window);
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

        const actor = global.get_window_actors()
            .find(a => a.get_meta_window() === nextWin);
        if (actor) {
            const wa     = Main.layoutManager.getWorkAreaForMonitor(nextWin.get_monitor());
            const finalY = actor.get_y();
            actor.set_y(wa.y + wa.height + 10);
            actor.ease({
                y:        finalY,
                duration: 300,
                mode:     Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        nextWin.activate(global.get_current_time());
        nextWin.raise();
        this._tabBars[zoneId]?.highlightWindow(nextWin);
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

        const actor = global.get_window_actors()
            .find(a => a.get_meta_window() === prevWin);
        if (actor) {
            const wa     = Main.layoutManager.getWorkAreaForMonitor(prevWin.get_monitor());
            const finalY = actor.get_y();
            actor.set_y(wa.y - actor.get_height() - 10);
            actor.ease({
                y:        finalY,
                duration: 300,
                mode:     Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        prevWin.activate(global.get_current_time());
        prevWin.raise();
        this._tabBars[zoneId]?.highlightWindow(prevWin);
    }

    _activateWindow(zoneId, window) {
        const now = global.get_current_time();
        window.activate(now);
        window.raise();
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
        log('destroy', 'Destroyed.');
    }
}

