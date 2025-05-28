// ./preferences/GeneralSettingsGroup.js
import Adw from 'gi://Adw'; 
import Gtk from 'gi://Gtk'; 
import Gio from 'gi://Gio'; 
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

const ENABLE_ZONING_KEY                     = 'enable-auto-zoning'; 
const RESTORE_ON_UNTILE_KEY                 = 'restore-original-size-on-untile'; 
const TILE_NEW_WINDOWS_KEY                  = 'tile-new-windows'; 
const HIGHLIGHT_ON_HOVER_KEY                = 'highlight-on-hover'; 
const CYCLE_ACCELERATOR_KEY                 = 'cycle-zone-windows-accelerator'; 
const CYCLE_BACKWARD_ACCELERATOR_KEY        = 'cycle-zone-windows-backward-accelerator'; 
const ZONE_GAP_SIZE_KEY                     = 'zone-gap-size'; 
const SNAP_EVASION_KEY                      = 'snap-evasion-key'; 
const log = msg => console.log(`[AutoZonerPrefs.GeneralSettings] ${msg}`); 

export function createGeneralSettingsGroup(settings) {
    const group = new Adw.PreferencesGroup({ title: _('General Settings') }); 

    // Enable Auto Zoning
    const enableSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); 
    settings.bind(ENABLE_ZONING_KEY, enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); 
    const enableRow = new Adw.ActionRow({ 
        title: _('Enable Auto Zoning'), 
        subtitle: _('Globally enable or disable the extension'), 
        activatable_widget: enableSwitch 
    });
    enableRow.add_suffix(enableSwitch); 
    group.add(enableRow); 

    // Snap Evasion Key
    const evasionKeyChoices = [ 
        { value: 'disabled', label: _('Disabled') }, 
        { value: 'control',  label: _('Control') }, 
        { value: 'alt',      label: _('Alt') }, 
        { value: 'shift',    label: _('Shift') }, 
        { value: 'super',    label: _('Super (Windows/Cmd)') } 
    ];
    const evasionKeyModel = new Gtk.StringList(); 
    evasionKeyChoices.forEach(choice => evasionKeyModel.append(choice.label)); 

    const evasionKeyRow = new Adw.ComboRow({ 
        title: _('Snap Evasion Key'), 
        subtitle: _('Hold this key while dragging to prevent snapping'), 
        model: evasionKeyModel, 
    });
    const currentEvasionKey = settings.get_string(SNAP_EVASION_KEY); 
    let currentEvasionKeyIndex = evasionKeyChoices.findIndex(c => c.value === currentEvasionKey); 
    if (currentEvasionKeyIndex === -1) currentEvasionKeyIndex = 0; 
    evasionKeyRow.selected = currentEvasionKeyIndex; 
    evasionKeyRow.connect('notify::selected', () => { 
        const selectedIndex = evasionKeyRow.selected; 
        if (selectedIndex >= 0 && selectedIndex < evasionKeyChoices.length) { 
            settings.set_string(SNAP_EVASION_KEY, evasionKeyChoices[selectedIndex].value); 
        }
    });
    const evasionKeySettingChangedId = settings.connect(`changed::${SNAP_EVASION_KEY}`, () => { 
        const updatedKey = settings.get_string(SNAP_EVASION_KEY); 
        let updatedIndex = evasionKeyChoices.findIndex(c => c.value === updatedKey); 
        if (updatedIndex === -1) updatedIndex = 0; 
        if (evasionKeyRow.selected !== updatedIndex) { 
            evasionKeyRow.selected = updatedIndex; 
        }
    });
    // Disconnect signal handled by parent AutoZonerPrefs window closure [cite: 567, 568, 610]
    group.add(evasionKeyRow); 

    // Highlight on Hover
    const hoverSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); 
    settings.bind(HIGHLIGHT_ON_HOVER_KEY, hoverSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); 
    const hoverRow = new Adw.ActionRow({ 
        title: _('Highlight Zone on Hover'), 
        subtitle: _('Visually highlight a zone when dragging a window over it'), 
        activatable_widget: hoverSwitch 
    });
    hoverRow.add_suffix(hoverSwitch); 
    group.add(hoverRow); 

    // Restore Original Size on Untile
    const restoreSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); 
    settings.bind(RESTORE_ON_UNTILE_KEY, restoreSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); 
    const restoreRow = new Adw.ActionRow({ 
        title: _('Restore Original Size on Untile'), 
        subtitle: _('When a window leaves all zones, restore its original size/position'), 
        activatable_widget: restoreSwitch 
    });
    restoreRow.add_suffix(restoreSwitch); 
    group.add(restoreRow); 

    // Tile New Windows
    const tileSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); 
    settings.bind(TILE_NEW_WINDOWS_KEY, tileSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); 
    const tileRow = new Adw.ActionRow({ 
        title: _('Tile New Windows'), 
        subtitle: _('Automatically tile newly opened windows if they fall into a zone'), 
        activatable_widget: tileSwitch 
    });
    tileRow.add_suffix(tileSwitch); 
    group.add(tileRow); 

    // Cycle Zone Windows Shortcut (forward)
    const accelEntry = new Gtk.Entry({ 
        hexpand: true, 
        placeholder_text: '<Control><Alt>8' 
    });
    const existing = settings.get_strv(CYCLE_ACCELERATOR_KEY); 
    accelEntry.set_text(existing[0] || ''); 
    accelEntry.connect('changed', () => { 
        const text = accelEntry.get_text().trim(); 
        if (text) { 
            settings.set_strv(CYCLE_ACCELERATOR_KEY, [ text ]); 
            log(`Set cycle shortcut: ${text}`); 
        } else {
            settings.set_strv(CYCLE_ACCELERATOR_KEY, []); 
        }
    });
    const accelRow = new Adw.ActionRow({ 
        title: _('Cycle Zone Windows Shortcut'), 
        subtitle: _('E.g. <Control><Alt>8 or <Super>grave'), 
    });
    accelRow.add_suffix(accelEntry); 
    accelRow.activatable_widget = accelEntry; 
    group.add(accelRow); 

    // Cycle Zone Windows Backward Shortcut
    const backwardAccelEntry = new Gtk.Entry({ 
        hexpand: true, 
        placeholder_text: '<Control><Alt>9' 
    });
    const existingBackward = settings.get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY); 
    backwardAccelEntry.set_text(existingBackward[0] || ''); 
    backwardAccelEntry.connect('changed', () => { 
        const text = backwardAccelEntry.get_text().trim(); 
        if (text) { 
            settings.set_strv(CYCLE_BACKWARD_ACCELERATOR_KEY, [ text ]); 
            log(`Set backward cycle shortcut: ${text}`); 
        } else {
            settings.set_strv(CYCLE_BACKWARD_ACCELERATOR_KEY, []); 
        }
    });
    const backwardAccelRow = new Adw.ActionRow({ 
        title: _('Cycle Zone Windows Backward Shortcut'), 
        subtitle: _('E.g. <Control><Shift><Alt>9 or <Super><Shift>grave'), 
    });
    backwardAccelRow.add_suffix(backwardAccelEntry); 
    backwardAccelRow.activatable_widget = backwardAccelEntry; 
    group.add(backwardAccelRow); 
    
    // Zone Gap Size
    const gapSpin = Gtk.SpinButton.new_with_range(0, 50, 1); 
    settings.bind(ZONE_GAP_SIZE_KEY, gapSpin, 'value', Gio.SettingsBindFlags.DEFAULT); 
    const gapRow = new Adw.ActionRow({ 
        title: _('Zone Gap Size (px)'), 
        subtitle: _('Gap around zones. 0 for no gaps. Re-snap windows to apply.'), 
        activatable_widget: gapSpin 
    });
    gapRow.add_suffix(gapSpin); 
    group.add(gapRow); 

    return { group, evasionKeySettingChangedId };
}
