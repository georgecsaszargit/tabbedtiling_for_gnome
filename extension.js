import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const ZONE_SETTINGS_KEY = 'zones';
const ENABLE_ZONING_KEY = 'enable-auto-zoning';
const RESTORE_ON_UNTILE_KEY = 'restore-original-size-on-untile';
const TILE_NEW_WINDOWS_KEY = 'tile-new-windows';
const HIGHLIGHT_ON_HOVER_KEY = 'highlight-on-hover';

const DEFAULT_ZONES_FILENAME = 'default_zones.json';
const HIGHLIGHT_TIMER_INTERVAL = 50; // ms for highlight update

// Simple logger
const log = (msg) => console.log(`[AutoZoner] ${msg}`);

// Helper to check if a point is inside a rect
function isPointInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
           point.y >= rect.y && point.y <= rect.y + rect.height;
}

class ZoneHighlighter extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            style_class: 'zone-highlight',
            visible: false,
            reactive: false,
            x_expand: false,
            y_expand: false,
            opacity: 0,
        });
        Main.uiGroup.add_child(this);
    }

    showAt(rect) {
        this.set_position(rect.x, rect.y);
        this.set_size(rect.width, rect.height);
        if (!this.visible) {
            this.show();
        }
        this.ease({
            opacity: 255,
            duration: 100,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    hide() {
        if (this.visible) {
            this.ease({
                opacity: 0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this.opacity === 0) this.hide();
                }
            });
        }
    }

    destroy() {
        if (this.get_parent()) {
            this.get_parent().remove_child(this);
        }
        super.destroy();
    }
}


class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._zones = [];
        this._signalHandlers = new Map();
        this._indicator = null;
        this._isDraggingWindow = false;
        this._highlightTimerId = 0;
        this._zoneHighlighters = new Map();
        this._currentlyHighlightedZoneInfo = null;
    }

    _initZoneHighlighters() {
        this._destroyZoneHighlighters();
        Main.layoutManager.monitors.forEach((monitor, index) => {
            const highlighter = new ZoneHighlighter();
            this._zoneHighlighters.set(index, highlighter);
        });
    }

    _destroyZoneHighlighters() {
        this._zoneHighlighters.forEach(highlighter => highlighter.destroy());
        this._zoneHighlighters.clear();
    }

    _loadSettings() {
        this._settings = this.getSettings();

        // --- MODIFICATION: Always try to load from default_zones.json and update GSettings ---
        log(`Attempting to load zones from ${DEFAULT_ZONES_FILENAME} to update GSettings on enable.`);
        const defaultZonesFile = Gio.File.new_for_path(GLib.build_filenamev([this.path, DEFAULT_ZONES_FILENAME]));

        try {
            if (defaultZonesFile.query_exists(null)) {
                const [success, contents] = defaultZonesFile.load_contents(null);
                if (success) {
                    const decoder = new TextDecoder('utf-8');
                    const newZonesStringFromFile = decoder.decode(contents);
                    if (newZonesStringFromFile.trim().startsWith('[') && newZonesStringFromFile.trim().endsWith(']')) {
                        const currentGSettingsZones = this._settings.get_string(ZONE_SETTINGS_KEY);
                        if (currentGSettingsZones !== newZonesStringFromFile) {
                            this._settings.set_string(ZONE_SETTINGS_KEY, newZonesStringFromFile);
                            log(`Updated GSettings for 'zones' from ${DEFAULT_ZONES_FILENAME}.`);
                        } else {
                            log(`GSettings for 'zones' already matches ${DEFAULT_ZONES_FILENAME}. No update needed.`);
                        }
                    } else {
                        log(`Error: Content of ${DEFAULT_ZONES_FILENAME} does not appear to be a valid JSON array string. GSettings not updated from file.`);
                    }
                } else {
                    log(`Error: Could not load contents of ${DEFAULT_ZONES_FILENAME}. GSettings not updated from file.`);
                }
            } else {
                 log(`Info: ${DEFAULT_ZONES_FILENAME} does not exist at path: ${defaultZonesFile.get_path()}. Using current GSettings for 'zones'.`);
            }
        } catch (e) {
            log(`Error processing ${DEFAULT_ZONES_FILENAME}: ${e}. Using current GSettings for 'zones'.`);
        }
        // --- END MODIFICATION ---

        this._loadZones(); // This will now load whatever is in GSettings

        this._connectSettingChange(ENABLE_ZONING_KEY, () => this._updateState());
        this._connectSettingChange(ZONE_SETTINGS_KEY, () => {
            log("GSetting 'zones' changed externally (e.g., by Prefs UI), reloading zones in extension.js");
            this._loadZones();
        });
        this._connectSettingChange(HIGHLIGHT_ON_HOVER_KEY, () => {
            if (!this._settings.get_boolean(HIGHLIGHT_ON_HOVER_KEY)) {
                this._hideAllHighlighters();
            }
        });
        this._connectSettingChange(RESTORE_ON_UNTILE_KEY, () => {});
        this._connectSettingChange(TILE_NEW_WINDOWS_KEY, () => {});
    }

    _loadZones() {
        try {
            const zonesJson = this._settings.get_string(ZONE_SETTINGS_KEY);
            this._zones = JSON.parse(zonesJson);
            if (!Array.isArray(this._zones)) {
                this._zones = [];
                log("Error: Zones setting is not an array. Reverting to empty.");
            }
            log(`Loaded ${this._zones.length} zones.`);
        } catch (e) {
            log(`Error parsing zones JSON: ${e}. Using empty zones array.`);
            this._zones = [];
        }
    }

    _connectSignal(gobject, signalName, callback) {
        const id = gobject.connect(signalName, callback);
        if (!this._signalHandlers.has(gobject)) {
            this._signalHandlers.set(gobject, []);
        }
        this._signalHandlers.get(gobject).push(id);
        return id;
    }

    _connectSettingChange(key, callback) {
        this._connectSignal(this._settings, `changed::${key}`, callback);
    }

    _disconnectAllSignalsFrom(gobject) {
        if (this._signalHandlers.has(gobject)) {
            this._signalHandlers.get(gobject).forEach(id => {
                try {
                    if (gobject.is_connected && gobject.is_connected(id)) {
                        gobject.disconnect(id);
                    } else if (gobject.disconnect && typeof gobject.disconnect === 'function') {
                         gobject.disconnect(id);
                    }
                } catch (e) {
                    log(`Error disconnecting signal ID ${id} from ${gobject}: ${e}`);
                }
            });
            this._signalHandlers.delete(gobject);
        }
    }

    _disconnectAllSignals() {
        this._signalHandlers.forEach((ids, gobject) => {
            ids.forEach(id => {
                 try {
                    if (gobject.is_connected && gobject.is_connected(id)) {
                        gobject.disconnect(id);
                    } else if (gobject.disconnect && typeof gobject.disconnect === 'function') {
                         gobject.disconnect(id);
                    }
                } catch (e) {
                    log(`Error disconnecting signal ID ${id} from ${gobject}: ${e}`);
                }
            });
        });
        this._signalHandlers.clear();
    }

    _getMonitorWorkArea(monitorIndex) {
        if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) {
            return Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        }
        return Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    }

    _onGrabOpBegin(display, window, grabOp) {
        if ((grabOp & Meta.GrabOp.MOVING) === 0) return;
        if (!window || window.get_window_type() !== Meta.WindowType.NORMAL || window.is_fullscreen()) return;

        this._isDraggingWindow = true;
        if (this._settings.get_boolean(HIGHLIGHT_ON_HOVER_KEY)) {
            if (this._highlightTimerId > 0) GLib.Source.remove(this._highlightTimerId);
            this._highlightTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, HIGHLIGHT_TIMER_INTERVAL, this._updateHighlightOnDrag.bind(this));
            this._updateHighlightOnDrag();
        }

        if (this._settings.get_boolean(RESTORE_ON_UNTILE_KEY) && !window._autoZonerOriginalRect && !window._autoZonerIsZoned) {
            window._autoZonerOriginalRect = window.get_frame_rect();
        }
    }

    _updateHighlightOnDrag() {
        if (!this._isDraggingWindow || !this._settings.get_boolean(HIGHLIGHT_ON_HOVER_KEY)) {
            this._hideAllHighlighters();
            this._currentlyHighlightedZoneInfo = null;
            return GLib.SOURCE_REMOVE;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const pointerMonitorIndex = global.display.get_monitor_index_for_rect(new Meta.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 }));

        if (pointerMonitorIndex === -1) {
            this._hideAllHighlighters();
            this._currentlyHighlightedZoneInfo = null;
            return GLib.SOURCE_CONTINUE;
        }

        const workArea = this._getMonitorWorkArea(pointerMonitorIndex);
        let hoveredZone = null;

        for (const zone of this._zones) {
            if (zone.monitorIndex === pointerMonitorIndex) {
                const absoluteZoneRect = {
                    x: workArea.x + zone.x, y: workArea.y + zone.y,
                    width: zone.width, height: zone.height
                };
                if (isPointInsideRect({ x: pointerX, y: pointerY }, absoluteZoneRect)) {
                    hoveredZone = zone;
                    break;
                }
            }
        }

        const highlighter = this._zoneHighlighters.get(pointerMonitorIndex);

        if (hoveredZone) {
            if (!this._currentlyHighlightedZoneInfo ||
                this._currentlyHighlightedZoneInfo.monitorIndex !== pointerMonitorIndex ||
                this._currentlyHighlightedZoneInfo.zone !== hoveredZone) {
                this._hideAllHighlighters();
                if (highlighter) {
                    const absoluteZoneRect = {
                        x: workArea.x + hoveredZone.x, y: workArea.y + hoveredZone.y,
                        width: hoveredZone.width, height: hoveredZone.height
                    };
                    highlighter.showAt(absoluteZoneRect);
                    this._currentlyHighlightedZoneInfo = { monitorIndex: pointerMonitorIndex, zone: hoveredZone };
                }
            }
        } else {
            if (this._currentlyHighlightedZoneInfo) {
                 const prevHighlighter = this._zoneHighlighters.get(this._currentlyHighlightedZoneInfo.monitorIndex);
                 if(prevHighlighter) prevHighlighter.hide();
                this._currentlyHighlightedZoneInfo = null;
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    _hideAllHighlighters() {
        this._zoneHighlighters.forEach(h => h.hide());
    }

    _onGrabOpEnd(display, window, grabOp) {
        this._isDraggingWindow = false;
        if (this._highlightTimerId > 0) {
            GLib.Source.remove(this._highlightTimerId);
            this._highlightTimerId = 0;
        }
        this._hideAllHighlighters();
        this._currentlyHighlightedZoneInfo = null;

        if (!this._settings.get_boolean(ENABLE_ZONING_KEY)) return;
        if (!window || window.get_window_type() !== Meta.WindowType.NORMAL || window.is_fullscreen()) {
            delete window._autoZonerIsZoned;
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const pointerMonitorIndex = global.display.get_monitor_index_for_rect(new Meta.Rectangle({ x: pointerX, y: pointerY, width: 1, height: 1 }));
        const finalMonitorIndex = (pointerMonitorIndex !== -1) ? pointerMonitorIndex : window.get_monitor();

        const workArea = this._getMonitorWorkArea(finalMonitorIndex);
        let targetZone = null;

        for (const zone of this._zones) {
            if (zone.monitorIndex === finalMonitorIndex) {
                const absoluteZoneRect = {
                    x: workArea.x + zone.x,
                    y: workArea.y + zone.y,
                    width: zone.width,
                    height: zone.height
                };
                if (isPointInsideRect({x: pointerX, y: pointerY}, absoluteZoneRect)) {
                    targetZone = zone;
                    break;
                }
            }
        }

        const currentlyZoned = window._autoZonerIsZoned === true;

        if (targetZone) {
            if (window.maximized_horizontally || window.maximized_vertically) {
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            }
            const newX = workArea.x + targetZone.x;
            const newY = workArea.y + targetZone.y;

            const currentRect = window.get_frame_rect();
            if (currentRect.x === newX && currentRect.y === newY &&
                currentRect.width === targetZone.width && currentRect.height === targetZone.height) {
                window._autoZonerIsZoned = true;
                return;
            }

            if (this._settings.get_boolean(RESTORE_ON_UNTILE_KEY) && !window._autoZonerOriginalRect) {
                 window._autoZonerOriginalRect = window.get_frame_rect();
            }

            window.move_resize_frame(false, newX, newY, targetZone.width, targetZone.height);
            window._autoZonerIsZoned = true;
            log(`Window ${window.get_title()} zoned to "${targetZone.name || 'Unnamed Zone'}"`);
        } else if (currentlyZoned) {
            if (this._settings.get_boolean(RESTORE_ON_UNTILE_KEY) && window._autoZonerOriginalRect) {
                const orig = window._autoZonerOriginalRect;
                window.move_resize_frame(false, orig.x, orig.y, orig.width, orig.height);
                log(`Window ${window.get_title()} unzoned, restored to original size.`);
                delete window._autoZonerOriginalRect;
            } else {
                log(`Window ${window.get_title()} unzoned.`);
            }
            delete window._autoZonerIsZoned;
        }

        if (!targetZone && !this._settings.get_boolean(RESTORE_ON_UNTILE_KEY) && window._autoZonerOriginalRect) {
            delete window._autoZonerOriginalRect;
        }
    }

    _onWindowCreated(display, window) {
        if (!this._settings.get_boolean(ENABLE_ZONING_KEY) || !this._settings.get_boolean(TILE_NEW_WINDOWS_KEY)) return;

        if (window.get_window_type() === Meta.WindowType.NORMAL && !window.skip_taskbar) {
            let actor = window.get_compositor_private();
            if (actor) {
                let signalId = 0;
                // Use a one-shot timeout to allow the window to settle
                const tryTileWithDelay = () => {
                     if (!window || window.is_destroyed()) {
                        return GLib.SOURCE_REMOVE;
                    }
                    this._tileNewWindow(window); // Attempt tiling
                    return GLib.SOURCE_REMOVE; // Only run once
                };
                 GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, tryTileWithDelay); // Increased delay
            }
        }
    }

    _tileNewWindow(window) {
        if (!window || window.is_destroyed() || window.is_fullscreen() || window.maximized_horizontally || window.maximized_vertically) {
            return true; // Considered "handled" if not applicable
        }

        const monitorIndex = window.get_monitor();
        const windowRect = window.get_frame_rect();

        if (windowRect.width === 0 || windowRect.height === 0 || monitorIndex === -1) {
            log(`New window ${window.get_title()} not ready for tiling (zero dimensions or no monitor).`);
            return false; // Indicate not ready
        }
        const workArea = this._getMonitorWorkArea(monitorIndex);

        const windowCenter = {
            x: windowRect.x + windowRect.width / 2,
            y: windowRect.y + windowRect.height / 2
        };

        let targetZone = null;
        for (const zone of this._zones) {
            if (zone.monitorIndex === monitorIndex) {
                const absoluteZoneRect = {
                    x: workArea.x + zone.x,
                    y: workArea.y + zone.y,
                    width: zone.width,
                    height: zone.height
                };
                if (isPointInsideRect(windowCenter, absoluteZoneRect)) {
                    targetZone = zone;
                    break;
                }
            }
        }

        if (targetZone) {
            if (this._settings.get_boolean(RESTORE_ON_UNTILE_KEY) && !window._autoZonerOriginalRect) { // Check if not already set
                 window._autoZonerOriginalRect = { ...windowRect };
            }
            window.move_resize_frame(false, workArea.x + targetZone.x, workArea.y + targetZone.y, targetZone.width, targetZone.height);
            window._autoZonerIsZoned = true;
            log(`New window ${window.get_title()} automatically zoned to "${targetZone.name || 'Unnamed Zone'}"`);
        }
        return true; // Tiling attempt complete
    }

    _addIndicator() {
        if (!this._indicator) {
            this._indicator = new PanelMenu.Button(0.5, _('Auto Zoner'), false);
            const icon = new St.Icon({
                icon_name: 'view-grid-symbolic',
                style_class: 'system-status-icon',
            });
            this._indicator.add_child(icon);
            this._updateIndicatorMenu();
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        }
    }

    _updateIndicatorMenu() {
        if (!this._indicator) return;
        this._indicator.menu.removeAll();

        const toggleItem = new PopupMenu.PopupSwitchMenuItem(
            _("Enable Auto Zoning"),
            this._settings.get_boolean(ENABLE_ZONING_KEY)
        );
        if (toggleItem._autoZonerConnected) toggleItem.disconnect(toggleItem._autoZonerConnected);
        toggleItem._autoZonerConnected = toggleItem.connect('toggled', (item) => {
            this._settings.set_boolean(ENABLE_ZONING_KEY, item.state);
        });
        this._indicator.menu.addMenuItem(toggleItem);

        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        if (prefsItem._autoZonerConnected) prefsItem.disconnect(prefsItem._autoZonerConnected);
        prefsItem._autoZonerConnected = prefsItem.connect('activate', () => this.openPreferences());
        this._indicator.menu.addMenuItem(prefsItem);
    }

    _removeIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _updateState() {
        const enabled = this._settings.get_boolean(ENABLE_ZONING_KEY);
        this._disconnectAllSignalsFrom(global.display);

        if (enabled) {
            this._connectSignal(global.display, 'grab-op-begin', (d, w, o) => this._onGrabOpBegin(d, w, o));
            this._connectSignal(global.display, 'grab-op-end', (d, w, o) => this._onGrabOpEnd(d, w, o));
            this._connectSignal(global.display, 'window-created', (d, w) => this._onWindowCreated(d, w));
        } else {
            this._isDraggingWindow = false;
            if (this._highlightTimerId > 0) {
                GLib.Source.remove(this._highlightTimerId);
                this._highlightTimerId = 0;
            }
            this._hideAllHighlighters();
            this._currentlyHighlightedZoneInfo = null;
        }

        if (this._indicator) this._updateIndicatorMenu();
        log(`Auto Zoning is now ${enabled ? 'enabled' : 'disabled'}`);
    }

    enable() {
        log('Enabling Auto Zoner');
        this._loadSettings();
        this._initZoneHighlighters();
        this._addIndicator();
        this._updateState();
        this._connectSignal(Main.layoutManager, 'monitors-changed', () => {
             log('Monitors changed, re-initializing highlighters.');
             this._initZoneHighlighters();
        });
    }

    disable() {
        log('Disabling Auto Zoner');
        this._isDraggingWindow = false;
        if (this._highlightTimerId > 0) {
            GLib.Source.remove(this._highlightTimerId);
            this._highlightTimerId = 0;
        }
        this._destroyZoneHighlighters();
        this._disconnectAllSignals();
        this._removeIndicator();

        global.get_window_actors().forEach(actor => {
            const window = actor.meta_window;
            if (window) {
                delete window._autoZonerIsZoned;
                delete window._autoZonerOriginalRect;
            }
        });

        this._settings = null;
        this._zones = [];
    }
}

export default function(metadata) {
    return new AutoZonerExtension(metadata);
}
