// modules/HighlightManager.js

import GLib from 'gi://GLib';
// Meta is not directly used for modifiers here, Clutter is.
import Mtk from 'gi://Mtk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ZoneHighlighter } from './ZoneHighlighter.js';
import { ZoneDetector } from './ZoneDetector.js';
import Clutter from 'gi://Clutter'; // Needed for Clutter.ModifierType

const HIGHLIGHT_TIMER_INTERVAL = 30;
const log = (msg) => console.log(`[AutoZoner.HighlightManager] ${msg}`);

export class HighlightManager {
    constructor(settingsManager) {
        this._settingsManager = settingsManager; // [cite: 417]
        this._zoneDetector = new ZoneDetector(); // [cite: 417]
        this._zoneHighlighters = new Map(); // [cite: 417]
        this._highlightTimerId = 0; // [cite: 417]
        this._currentlyHighlightedInfo = null; // [cite: 417]

        this._initZoneHighlighters(); // [cite: 417]
        log("Initialized."); // [cite: 417]
    }

    _initZoneHighlighters() {
        this._destroyZoneHighlighters(); // [cite: 419]
        Main.layoutManager.monitors.forEach((monitor, index) => { // [cite: 419]
            const highlighter = new ZoneHighlighter(); // [cite: 419]
            this._zoneHighlighters.set(index, highlighter); // [cite: 419]
        });
        log(`Initialized ${this._zoneHighlighters.size} highlighters.`); // [cite: 420]
    }

    _destroyZoneHighlighters() {
        this._zoneHighlighters.forEach(highlighter => highlighter.destroy()); // [cite: 421]
        this._zoneHighlighters.clear(); // [cite: 421]
        log("Destroyed all highlighters."); // [cite: 421]
    }

    _getMonitorWorkArea(monitorIndex) {
        if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) { // [cite: 422]
            return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex); // [cite: 422]
        }
        return Main.layoutManager.getWorkAreaForMonitor(monitorIndex); // [cite: 423]
    }

    _updateHighlightOnDrag() {
        if (this._highlightTimerId === 0) return GLib.SOURCE_REMOVE; // [cite: 424]

        // Get current modifier state
        const [, , mods] = global.get_pointer();
        const isCtrlHeld = (mods & Clutter.ModifierType.CONTROL_MASK) !== 0;

        // If Ctrl is held, immediately hide any highlight and skip further processing for this tick
        if (isCtrlHeld) {
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide();
                this._currentlyHighlightedInfo = null;
            }
            return GLib.SOURCE_CONTINUE; // Keep timer alive but do nothing else
        }

        if (!this._settingsManager.isHighlightOnHoverEnabled()) { // [cite: 424]
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide(); // [cite: 425]
                this._currentlyHighlightedInfo = null; // [cite: 425]
            }
            // Stop the timer if highlighting is disabled
            return GLib.SOURCE_REMOVE; // [cite: 426]
        }

        const [pointerX, pointerY] = global.get_pointer(); // [cite: 427]
        const pointerMonitorIndex = global.display.get_monitor_index_for_rect(new Mtk.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 })); // [cite: 427]
        
        if (pointerMonitorIndex === -1) { // [cite: 428]
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide(); // [cite: 429]
                this._currentlyHighlightedInfo = null; // [cite: 429]
            }
            return GLib.SOURCE_CONTINUE; // [cite: 430]
        }

        const zones = this._settingsManager.getZones(); // [cite: 431]
        const hoveredZone = this._zoneDetector.findTargetZone(zones, {x: pointerX, y: pointerY}, pointerMonitorIndex); // [cite: 431]
        const currentHighlighterOnPointerMonitor = this._zoneHighlighters.get(pointerMonitorIndex); // [cite: 431]

        if (hoveredZone) { // [cite: 432]
            if (!this._currentlyHighlightedInfo ||
                this._currentlyHighlightedInfo.monitorIndex !== pointerMonitorIndex ||
                (this._currentlyHighlightedInfo.zone.name || JSON.stringify(this._currentlyHighlightedInfo.zone)) !== (hoveredZone.name || JSON.stringify(hoveredZone))) { // [cite: 432]

                if (this._currentlyHighlightedInfo && this._currentlyHighlightedInfo.highlighter) { // [cite: 433]
                   this._currentlyHighlightedInfo.highlighter.requestHide(); // [cite: 433]
                }

                if (currentHighlighterOnPointerMonitor) { // [cite: 434]
                    const workArea = this._getMonitorWorkArea(pointerMonitorIndex); // [cite: 434]
                    const absoluteZoneRect = { // [cite: 434]
                        x: workArea.x + hoveredZone.x, y: workArea.y + hoveredZone.y, // [cite: 434]
                        width: hoveredZone.width, height: hoveredZone.height // [cite: 434]
                    };
                    currentHighlighterOnPointerMonitor.showAt(absoluteZoneRect); // [cite: 435]
                    this._currentlyHighlightedInfo = { // [cite: 435]
                        monitorIndex: pointerMonitorIndex, // [cite: 435]
                        zone: hoveredZone, // [cite: 435]
                        highlighter: currentHighlighterOnPointerMonitor // [cite: 435]
                    };
                } else {
                     this._currentlyHighlightedInfo = null; // [cite: 437]
                }
            }
        } else { // [cite: 438]
            if (this._currentlyHighlightedInfo) {
                if (this._currentlyHighlightedInfo.monitorIndex === pointerMonitorIndex) { // [cite: 438]
                    this._currentlyHighlightedInfo.highlighter.requestHide(); // [cite: 438]
                    this._currentlyHighlightedInfo = null; // [cite: 438]
                }
                // If the pointer is on a different monitor than the current highlight,
                // and no zone is hovered on the new monitor, the old highlight should also be hidden.
                // This case might be implicitly handled if _currentlyHighlightedInfo.monitorIndex !== pointerMonitorIndex
                // and currentHighlighterOnPointerMonitor is null or doesn't find a zone.
                // However, to be explicit:
                else if (this._currentlyHighlightedInfo.monitorIndex !== pointerMonitorIndex) {
                    this._currentlyHighlightedInfo.highlighter.requestHide();
                    this._currentlyHighlightedInfo = null;
                }
            }
        }
        return GLib.SOURCE_CONTINUE; // [cite: 439]
    }

    startUpdating() {
        // Check if Ctrl is held *before* even starting the timer
        const [, , mods] = global.get_pointer();
        const isCtrlHeld = (mods & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (isCtrlHeld) {
            log("Ctrl is held; not starting highlight updates.");
            // Ensure any active highlight is hidden if Ctrl is held when startUpdating is called
            this._hideAllActiveHighlighters();
            // And ensure timer is not running
            if (this._highlightTimerId > 0) {
                GLib.Source.remove(this._highlightTimerId);
                this._highlightTimerId = 0;
            }
            return; // Do not start the timer
        }

        if (this._settingsManager.isHighlightOnHoverEnabled()) { // [cite: 440]
            if (this._highlightTimerId > 0) GLib.Source.remove(this._highlightTimerId); // [cite: 440]
            this._highlightTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, HIGHLIGHT_TIMER_INTERVAL, this._updateHighlightOnDrag.bind(this)); // [cite: 440]
            log("Started highlight updates."); // [cite: 440]
        } else {
            log("Highlighting disabled, not starting updates."); // [cite: 441]
            if (this._highlightTimerId > 0) { // [cite: 441]
                GLib.Source.remove(this._highlightTimerId); // [cite: 442]
                this._highlightTimerId = 0; // [cite: 442]
            }
             this._hideAllActiveHighlighters(); // [cite: 443]
        }
    }

    stopUpdating() {
        if (this._highlightTimerId > 0) { // [cite: 444]
            GLib.Source.remove(this._highlightTimerId); // [cite: 444]
            this._highlightTimerId = 0; // [cite: 444]
        }
        this._hideAllActiveHighlighters(); // [cite: 445]
        this._currentlyHighlightedInfo = null; // [cite: 445]
        log("Stopped highlight updates."); // [cite: 446]
    }

    _hideAllActiveHighlighters() {
        this._zoneHighlighters.forEach(highlighter => { // [cite: 447]
            // Check if the highlighter might be showing or intending to show
            if (highlighter.isShowingIntent || highlighter.visible || highlighter.opacity > 0) { // [cite: 447]
                highlighter.requestHide(); // [cite: 447]
            }
        });
    }

    reinitHighlighters() {
        this.stopUpdating(); // [cite: 448]
        this._initZoneHighlighters(); // [cite: 448]
    }

    destroy() {
        this.stopUpdating(); // [cite: 449]
        this._destroyZoneHighlighters(); // [cite: 449]
        log("Destroyed."); // [cite: 449]
    }
}
