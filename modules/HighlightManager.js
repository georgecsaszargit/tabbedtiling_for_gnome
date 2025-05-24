// modules/HighlightManager.js

import GLib from 'gi://GLib';
import Mtk from 'gi://Mtk';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ZoneHighlighter } from './ZoneHighlighter.js';
import { ZoneDetector } from './ZoneDetector.js';
import Clutter from 'gi://Clutter';

const HIGHLIGHT_TIMER_INTERVAL = 30;
const log = (msg) => console.log(`[AutoZoner.HighlightManager] ${msg}`);

export class HighlightManager {
    constructor(settingsManager) {
        this._settingsManager = settingsManager;
        this._zoneDetector = new ZoneDetector();
        this._zoneHighlighters = new Map();
        this._highlightTimerId = 0;
        this._currentlyHighlightedInfo = null;

        this._initZoneHighlighters();
        log("Initialized.");
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
        if (this._highlightTimerId === 0) return GLib.SOURCE_REMOVE;

        const evasionKeyMask = this._getEvasionKeyMask();
        const [, , mods] = global.get_pointer();
        const isEvasionKeyHeld = evasionKeyMask !== 0 && (mods & evasionKeyMask) !== 0;

        if (isEvasionKeyHeld) {
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide();
                this._currentlyHighlightedInfo = null;
            }
            return GLib.SOURCE_CONTINUE;
        }

        if (!this._settingsManager.isHighlightOnHoverEnabled()) {
            if (this._currentlyHighlightedInfo) {
                this._currentlyHighlightedInfo.highlighter.requestHide();
                this._currentlyHighlightedInfo = null;
            }
            return GLib.SOURCE_REMOVE;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const pointerMonitorIndex = global.display.get_monitor_index_for_rect(new Mtk.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 }));
        
        if (pointerMonitorIndex === -1) {
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
            if (!this._currentlyHighlightedInfo ||
                this._currentlyHighlightedInfo.monitorIndex !== pointerMonitorIndex ||
                (this._currentlyHighlightedInfo.zone.name || JSON.stringify(this._currentlyHighlightedInfo.zone)) !== (hoveredZone.name || JSON.stringify(hoveredZone))) {

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
                     this._currentlyHighlightedInfo = null;
                }
            }
        } else {
            if (this._currentlyHighlightedInfo) {
                if (this._currentlyHighlightedInfo.monitorIndex === pointerMonitorIndex) {
                    this._currentlyHighlightedInfo.highlighter.requestHide();
                    this._currentlyHighlightedInfo = null;
                }
                else if (this._currentlyHighlightedInfo.monitorIndex !== pointerMonitorIndex) {
                    this._currentlyHighlightedInfo.highlighter.requestHide();
                    this._currentlyHighlightedInfo = null;
                }
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    startUpdating() {
        const evasionKeyMask = this._getEvasionKeyMask();
        const [, , mods] = global.get_pointer();
        const isEvasionKeyHeld = evasionKeyMask !== 0 && (mods & evasionKeyMask) !== 0;

        if (isEvasionKeyHeld) {
            const keyName = this._settingsManager.getSnapEvasionKeyName();
            log(`${keyName} key is held; not starting highlight updates.`);
            this._hideAllActiveHighlighters();
            if (this._highlightTimerId > 0) {
                GLib.Source.remove(this._highlightTimerId);
                this._highlightTimerId = 0;
            }
            return;
        }

        if (this._settingsManager.isHighlightOnHoverEnabled()) {
            if (this._highlightTimerId > 0) GLib.Source.remove(this._highlightTimerId);
            this._highlightTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, HIGHLIGHT_TIMER_INTERVAL, this._updateHighlightOnDrag.bind(this));
            log("Started highlight updates.");
        } else {
            log("Highlighting disabled, not starting updates.");
            if (this._highlightTimerId > 0) {
                GLib.Source.remove(this._highlightTimerId);
                this._highlightTimerId = 0;
            }
             this._hideAllActiveHighlighters();
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

    _hideAllActiveHighlighters() {
        this._zoneHighlighters.forEach(highlighter => {
            if (highlighter.isShowingIntent || highlighter.visible || highlighter.opacity > 0) {
                highlighter.requestHide();
            }
        });
    }

    reinitHighlighters() {
        this.stopUpdating();
        this._initZoneHighlighters();
    }

    destroy() {
        this.stopUpdating();
        this._destroyZoneHighlighters();
        log("Destroyed.");
    }
}
