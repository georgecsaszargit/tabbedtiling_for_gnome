// extension.js

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main     from 'resource:///org/gnome/shell/ui/main.js';
import Meta          from 'gi://Meta';
import Shell         from 'gi://Shell';
import GLib          from 'gi://GLib';
import Gio           from 'gi://Gio'; // <<<--- IMPORT Gio for D-Bus

import { SettingsManager }  from './modules/SettingsManager.js';
import { HighlightManager } from './modules/HighlightManager.js';
import { WindowManager }    from './modules/WindowManager.js';
import { Indicator }        from './modules/Indicator.js';

const ENABLE_ZONING_KEY                  = 'enable-auto-zoning';
const CYCLE_ACCELERATOR_KEY              = 'cycle-zone-windows-accelerator';
const CYCLE_BACKWARD_ACCELERATOR_KEY     = 'cycle-zone-windows-backward-accelerator';
const ZONE_GAP_SIZE_KEY                  = 'zone-gap-size';
const TAB_BAR_HEIGHT_KEY                 = 'tab-bar-height';

const log = msg => console.log(`[AutoZoner.Main] ${msg}`);

// D-Bus interface for SessionManager's Resumed signal
const SessionManagerIface = `
<node>
    <interface name="org.gnome.SessionManager">
        <signal name="Resumed" />
    </interface>
</node>`;
const SessionManagerProxy = Gio.DBusProxy.makeProxyWrapper(SessionManagerIface);

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settingsManager             = null;
        this._highlightManager            = null;
        this._windowManager               = null;
        this._indicator                   = null;
        this._monitorsChangedId           = 0;
        this._snapOnMonitorsChangedTimeoutId = 0; // For debouncing/delaying snap on monitor change
        this._zoningChangedId             = 0;
        this._cycleAccelChangedId         = 0;
        this._cycleBackwardAccelChangedId = 0;
        this._zoneGapChangedId            = 0;
        this._tabBarHeightChangedId       = 0;

        this._sessionProxy                = null; // For D-Bus SessionManager
        this._sessionResumedSignalId      = 0;    // Signal ID for Resumed
        this._snapOnResumeTimeoutId       = 0;    // For debouncing/delaying snap on resume
    }

    _performDelayedSnap(reason = "unknown change") {
        // Common function to snap windows, possibly with a delay or debounce
        // For now, we'll keep delays separate but this could be a point for future debounce logic
        if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) {
            log(`Re-snapping windows due to: ${reason}`);
            this._windowManager.snapAllWindowsToZones();
        }
    }

    enable() {
        log('Enabling…');
        this._settingsManager  = new SettingsManager(this.getSettings(), this.path);
        this._highlightManager = new HighlightManager(this._settingsManager);
        this._windowManager    = new WindowManager(this._settingsManager, this._highlightManager);
        this._indicator        = new Indicator(this.uuid, this._settingsManager, this);
        
        this._windowManager.connectSignals();
        
        if (this._settingsManager.isZoningEnabled()) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 300, () => {
                if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) {
                     log('Performing initial snapAllWindowsToZones after delay...');
                     this._performDelayedSnap("initial enable");
                }
                return GLib.SOURCE_REMOVE;
            });
        }

        this._zoningChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${ENABLE_ZONING_KEY}`,
            () => {
                this._windowManager.connectSignals(); 
                if (this._settingsManager.isZoningEnabled()) {
                    this._performDelayedSnap("zoning enabled toggle");
                }
                this._indicator.updateToggleState();
            }
        );

        this._zoneGapChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${ZONE_GAP_SIZE_KEY}`,
            () => {
                log('Zone gap size setting changed; re-snapping windows...');
                this._performDelayedSnap("zone gap change");
            }
        );

        this._tabBarHeightChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${TAB_BAR_HEIGHT_KEY}`,
            () => {
                log('Tab bar height setting changed; re-snapping windows...');
                this._performDelayedSnap("tab bar height change");
            }
        );

        if (Main.layoutManager) {
            this._monitorsChangedId = Main.layoutManager.connect(
                'monitors-changed',
                () => {
                    log('Monitors changed event detected.');
                    if (this._highlightManager) this._highlightManager.reinitHighlighters();
                    
                    if (this._snapOnMonitorsChangedTimeoutId > 0) {
                        GLib.Source.remove(this._snapOnMonitorsChangedTimeoutId);
                    }
                    this._snapOnMonitorsChangedTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 750, () => { // Slightly longer delay
                        log('Processing monitors changed event (delayed).');
                        this._performDelayedSnap("monitors changed");
                        this._snapOnMonitorsChangedTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            );
        }

        // Connect to SessionManager Resumed signal
        try {
            this._sessionProxy = new SessionManagerProxy(
                Gio.DBus.session,
                'org.gnome.SessionManager',
                '/org/gnome/SessionManager',
                (proxy, error) => {
                    if (error) {
                        log(`Error creating SessionManager proxy: ${error.message}`);
                        this._sessionProxy = null; // Ensure it's null if failed
                        return;
                    }
                    if (!this._sessionProxy) { // Check if proxy is null (e.g. init failed but no error object)
                        log('SessionManager proxy initialization failed silently.');
                        return;
                    }
                    this._sessionResumedSignalId = this._sessionProxy.connectSignal('Resumed', () => {
                        log('System Resumed signal received.');
                        if (this._snapOnResumeTimeoutId > 0) {
                             GLib.Source.remove(this._snapOnResumeTimeoutId);
                        }
                        // Using a delay to allow the session to fully resume and stabilize
                        this._snapOnResumeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 1000, () => { // 1 second delay
                            log('Processing Resumed signal (delayed snap).');
                            this._performDelayedSnap("system resume");
                            this._snapOnResumeTimeoutId = 0;
                            return GLib.SOURCE_REMOVE;
                        });
                    });
                    log('Connected to SessionManager Resumed signal.');
                }
            );
        } catch (e) {
            log(`Failed to create SessionManager D-Bus proxy: ${e}`);
            this._sessionProxy = null;
        }


        this._addCycleKeybinding();
        this._addCycleBackwardKeybinding();
        // ... (rest of keybinding signal connections remain the same)

        this._cycleAccelChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${CYCLE_ACCELERATOR_KEY}`,
            () => {
                log('Cycle accelerator changed; rebinding…');
                Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY);
                this._addCycleKeybinding();
            }
        );
        this._cycleBackwardAccelChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${CYCLE_BACKWARD_ACCELERATOR_KEY}`,
            () => {
                log('Backward cycle accelerator changed; rebinding…');
                Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY);
                this._addCycleBackwardKeybinding();
            }
        );

        log('Enabled.');
    }

    disable() {
        log('Disabling…');

        // Clear any pending timeouts
        if (this._snapOnMonitorsChangedTimeoutId > 0) {
            GLib.Source.remove(this._snapOnMonitorsChangedTimeoutId);
            this._snapOnMonitorsChangedTimeoutId = 0;
        }
        if (this._snapOnResumeTimeoutId > 0) {
            GLib.Source.remove(this._snapOnResumeTimeoutId);
            this._snapOnResumeTimeoutId = 0;
        }

        // Disconnect D-Bus SessionManager signal
        if (this._sessionProxy && this._sessionResumedSignalId > 0) {
            try {
                this._sessionProxy.disconnectSignal(this._sessionResumedSignalId);
            } catch (e) {
                log(`Error disconnecting SessionManager Resumed signal: ${e}`);
            }
            this._sessionResumedSignalId = 0;
        }
        // GJS DBus proxies don't have explicit close/destroy. Setting to null helps GC.
        this._sessionProxy = null;


        if (this._monitorsChangedId > 0 && Main.layoutManager) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._zoningChangedId > 0) {
            this._settingsManager.getGSettingObject().disconnect(this._zoningChangedId);
            this._zoningChangedId = 0;
        }
        // ... (disconnect other GSettings signals: cycle, zoneGap, tabBarHeight)
        if (this._cycleAccelChangedId > 0) {
             this._settingsManager.getGSettingObject().disconnect(this._cycleAccelChangedId);
             this._cycleAccelChangedId = 0;
        }
        if (this._cycleBackwardAccelChangedId > 0) {
             this._settingsManager.getGSettingObject().disconnect(this._cycleBackwardAccelChangedId);
             this._cycleBackwardAccelChangedId = 0;
        }
        if (this._zoneGapChangedId > 0) {
             this._settingsManager.getGSettingObject().disconnect(this._zoneGapChangedId);
             this._zoneGapChangedId = 0;
        }
        if (this._tabBarHeightChangedId > 0) {
             this._settingsManager.getGSettingObject().disconnect(this._tabBarHeightChangedId);
             this._tabBarHeightChangedId = 0;
        }


        Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY);
        Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY);

        if (this._windowManager) {
            this._windowManager.cleanupWindowProperties();
            this._windowManager.destroy();
            this._windowManager = null;
        }
        if (this._highlightManager) {
            this._highlightManager.destroy();
            this._highlightManager = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._settingsManager) {
            this._settingsManager.destroy();
            this._settingsManager = null;
        }

        log('Disabled.');
    }

    // _addCycleKeybinding and _addCycleBackwardKeybinding methods remain the same
    _addCycleKeybinding() {
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_ACCELERATOR_KEY)[0];
        log(`Binding cycle shortcut: ${accel}`);

        Main.wm.addKeybinding(
            CYCLE_ACCELERATOR_KEY,
            this._settingsManager.getGSettingObject(),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => {
                log('🏷️ Cycle shortcut pressed!');
                if (this._windowManager) this._windowManager.cycleWindowsInCurrentZone();
            }
        );
    }

    _addCycleBackwardKeybinding() {
        const accel = this._settingsManager.getGSettingObject().get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY)[0];
        log(`Binding backward cycle shortcut: ${accel}`);

        Main.wm.addKeybinding(
            CYCLE_BACKWARD_ACCELERATOR_KEY,
            this._settingsManager.getGSettingObject(),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => {
                log('🏷️ Backward cycle shortcut pressed!');
                if (this._windowManager) this._windowManager.cycleWindowsInCurrentZoneBackward();
            }
        );
    }
}
