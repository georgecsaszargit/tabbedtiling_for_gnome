// extension.js

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main     from 'resource:///org/gnome/shell/ui/main.js';
import Meta          from 'gi://Meta';
import Shell         from 'gi://Shell';
import GLib          from 'gi://GLib'; // <<<--- IMPORT GLib

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

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settingsManager             = null;
        this._highlightManager            = null;
        this._windowManager               = null;
        this._indicator                   = null;
        this._monitorsChangedId           = 0;
        this._zoningChangedId             = 0;
        this._cycleAccelChangedId         = 0;
        this._cycleBackwardAccelChangedId = 0;
        this._zoneGapChangedId            = 0;
        this._tabBarHeightChangedId       = 0;
    }

    enable() {
        log('Enabling…');
        this._settingsManager  = new SettingsManager(this.getSettings(), this.path);
        this._highlightManager = new HighlightManager(this._settingsManager);
        this._windowManager    = new WindowManager(this._settingsManager, this._highlightManager);
        this._indicator        = new Indicator(this.uuid, this._settingsManager, this);
        
        this._windowManager.connectSignals();
        
        // Delay initial snap to allow Shell to settle
        if (this._settingsManager.isZoningEnabled()) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 300, () => { // 300ms delay
                // Check if extension is still enabled and settings are valid
                if (this._settingsManager && this._settingsManager.isZoningEnabled() && this._windowManager) {
                     log('Performing initial snapAllWindowsToZones after delay...');
                     this._windowManager.snapAllWindowsToZones();
                }
                return GLib.SOURCE_REMOVE; // Important to remove the timeout source
            });
        }

        this._zoningChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${ENABLE_ZONING_KEY}`,
            () => {
                this._windowManager.connectSignals(); 
                if (this._settingsManager.isZoningEnabled()) {
                    this._windowManager.snapAllWindowsToZones();
                }
                this._indicator.updateToggleState();
            }
        );

        this._zoneGapChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${ZONE_GAP_SIZE_KEY}`,
            () => {
                log('Zone gap size setting changed; re-snapping windows...');
                if (this._settingsManager.isZoningEnabled()) {
                    this._windowManager.snapAllWindowsToZones();
                }
            }
        );

        this._tabBarHeightChangedId = this._settingsManager.getGSettingObject().connect(
            `changed::${TAB_BAR_HEIGHT_KEY}`,
            () => {
                log('Tab bar height setting changed; re-snapping windows...');
                if (this._settingsManager.isZoningEnabled()) {
                    this._windowManager.snapAllWindowsToZones();
                }
            }
        );

        if (Main.layoutManager) {
            this._monitorsChangedId = Main.layoutManager.connect(
                'monitors-changed',
                () => {
                    log('Monitors changed; re-initializing highlighters and re-snapping windows...');
                    this._highlightManager.reinitHighlighters();
                    if (this._settingsManager.isZoningEnabled()) {
                        this._windowManager.snapAllWindowsToZones();
                    }
                }
            );
        }

        this._addCycleKeybinding();
        this._addCycleBackwardKeybinding();
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
        if (this._monitorsChangedId && Main.layoutManager) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._zoningChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._zoningChangedId);
            this._zoningChangedId = 0;
        }
        if (this._cycleAccelChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._cycleAccelChangedId);
            this._cycleAccelChangedId = 0;
        }
        if (this._cycleBackwardAccelChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._cycleBackwardAccelChangedId);
            this._cycleBackwardAccelChangedId = 0;
        }
        if (this._zoneGapChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._zoneGapChangedId);
            this._zoneGapChangedId = 0;
        }
        if (this._tabBarHeightChangedId) {
            this._settingsManager.getGSettingObject().disconnect(this._tabBarHeightChangedId);
            this._tabBarHeightChangedId = 0;
        }

        Main.wm.removeKeybinding(CYCLE_ACCELERATOR_KEY);
        Main.wm.removeKeybinding(CYCLE_BACKWARD_ACCELERATOR_KEY);

        // Ensure managers exist before calling methods on them during disable
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
