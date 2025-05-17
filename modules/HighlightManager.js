import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ZoneHighlighter } from './ZoneHighlighter.js';
import { ZoneDetector } from './ZoneDetector.js';

const HIGHLIGHT_TIMER_INTERVAL = 30; // Reduced interval for more responsiveness
const log = (msg) => console.log(`[AutoZoner.HighlightManager] ${msg}`);

export class HighlightManager {
    constructor(settingsManager) {
        this._settingsManager = settingsManager;
        this._zoneDetector = new ZoneDetector();
        this._zoneHighlighters = new Map();
        this._highlightTimerId = 0;
        this._currentlyHighlightedInfo = null; // { monitorIndex, zone, highlighter }

        this._initZoneHighlighters();
        log("Initialized.");
    }

    _initZoneHighlighters() {
        this._destroyZoneHighlighters();
        Main.layoutManager.monitors.forEach((monitor, index) => {
            const highlighter = new ZoneHighlighter();
            this._zoneHighlighters.set(index, highlighter);
        });
        log(`Initialized ${this._zoneHighlighters.size} highlighters.`);
    }

    _destroyZoneHighlighters() {
        this._zoneHighlighters.forEach(highlighter => highlighter.destroy());
        this._zoneHighlighters.clear();
        log("Destroyed all highlighters.");
    }

    _getMonitorWorkArea(monitorIndex) {
        if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) {
            return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        }
        return Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    }

    _updateHighlightOnDrag() {
        // If timer is stopped externally (e.g., drag ends), this ensures it doesn't run.
        if (this._highlightTimerId === 0) return GLib.SOURCE_REMOVE;

        if (!this._settingsManager.isHighlightOnHoverEnabled()) {
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide();
                this._currentlyHighlightedInfo = null;
            }
            return GLib.SOURCE_REMOVE; // Stop timer if highlighting is globally disabled
        }

        const [pointerX, pointerY] = global.get_pointer();
        const pointerMonitorIndex = global.display.get_monitor_index_for_rect(new Meta.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 }));

        if (pointerMonitorIndex === -1) { // Pointer not on any monitor
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide();
                this._currentlyHighlightedInfo = null;
            }
            return GLib.SOURCE_CONTINUE;
        }

        const zones = this._settingsManager.getZones();
        const hoveredZone = this._zoneDetector.findTargetZone(zones, {x: pointerX, y: pointerY}, pointerMonitorIndex);
        const currentHighlighterOnPointerMonitor = this._zoneHighlighters.get(pointerMonitorIndex);

        if (hoveredZone) {
            // Is this a new zone or a different monitor than what's currently highlighted?
            if (!this._currentlyHighlightedInfo ||
                this._currentlyHighlightedInfo.monitorIndex !== pointerMonitorIndex ||
                this._currentlyHighlightedInfo.zone.name !== hoveredZone.name || // Compare by a unique zone identifier if available
                this._currentlyHighlightedInfo.zone.x !== hoveredZone.x ||       // Or by all relevant properties
                this._currentlyHighlightedInfo.zone.y !== hoveredZone.y) {

                // Hide previous highlighter if it exists and is on a different monitor or is a different zone
                if (this._currentlyHighlightedInfo && this._currentlyHighlightedInfo.highlighter) {
                    this._currentlyHighlightedInfo.highlighter.requestHide();
                }

                if (currentHighlighterOnPointerMonitor) {
                    const workArea = this._getMonitorWorkArea(pointerMonitorIndex);
                    const absoluteZoneRect = {
                        x: workArea.x + hoveredZone.x, y: workArea.y + hoveredZone.y,
                        width: hoveredZone.width, height: hoveredZone.height
                    };
                    currentHighlighterOnPointerMonitor.showAt(absoluteZoneRect);
                    this._currentlyHighlightedInfo = {
                        monitorIndex: pointerMonitorIndex,
                        zone: hoveredZone,
                        highlighter: currentHighlighterOnPointerMonitor
                    };
                } else {
                     this._currentlyHighlightedInfo = null; // No highlighter for this monitor
                }
            }
            // If it's the same zone and monitor, do nothing, the highlighter is already shown.
        } else { // Not hovering any zone on the current monitor
            if (this._currentlyHighlightedInfo) {
                // Only hide if the current highlight was on the same monitor the pointer is now on,
                // or if the pointer moved off all monitors entirely (handled by pointerMonitorIndex === -1 case)
                if (this._currentlyHighlightedInfo.monitorIndex === pointerMonitorIndex) {
                    this._currentlyHighlightedInfo.highlighter.requestHide();
                    this._currentlyHighlightedInfo = null;
                }
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    startUpdating() {
        if (this._settingsManager.isHighlightOnHoverEnabled()) {
            if (this._highlightTimerId > 0) GLib.Source.remove(this._highlightTimerId); // Clear previous
            this._highlightTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, HIGHLIGHT_TIMER_INTERVAL, this._updateHighlightOnDrag.bind(this));
            log("Started highlight updates.");
        } else {
            log("Highlighting disabled, not starting updates.");
            if (this._highlightTimerId > 0) { // Ensure timer is stopped if setting is off
                GLib.Source.remove(this._highlightTimerId);
                this._highlightTimerId = 0;
            }
             this._hideAllActiveHighlighters(); // Ensure all are hidden if setting is off
        }
    }

    stopUpdating() {
        if (this._highlightTimerId > 0) {
            GLib.Source.remove(this._highlightTimerId);
            this._highlightTimerId = 0;
        }
        this._hideAllActiveHighlighters();
        this._currentlyHighlightedInfo = null;
        log("Stopped highlight updates.");
    }

    _hideAllActiveHighlighters() { // Renamed to avoid conflict with ZoneHighlighter's own hide
        this._zoneHighlighters.forEach(highlighter => {
            if (highlighter.isShowingIntent || highlighter.visible) { // Check intent or actual visibility
                highlighter.requestHide();
            }
        });
    }

    reinitHighlighters() {
        this.stopUpdating(); // Stop current operations
        this._initZoneHighlighters();
        // No need to restart updating here, it will be started on next grab-op-begin if enabled
    }

    destroy() {
        this.stopUpdating();
        this._destroyZoneHighlighters();
        log("Destroyed.");
    }
}
