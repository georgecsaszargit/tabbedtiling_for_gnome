// ./preferences/GeneralSettingsGroup.js
import Adw from 'gi://Adw'; // [cite: 511]
import Gtk from 'gi://Gtk'; // [cite: 512]
import Gio from 'gi://Gio'; // [cite: 512]
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; // [cite: 513]

const ENABLE_ZONING_KEY                     = 'enable-auto-zoning'; // [cite: 515]
const RESTORE_ON_UNTILE_KEY                 = 'restore-original-size-on-untile'; // [cite: 516]
const TILE_NEW_WINDOWS_KEY                  = 'tile-new-windows'; // [cite: 517]
const HIGHLIGHT_ON_HOVER_KEY                = 'highlight-on-hover'; // [cite: 518]
const CYCLE_ACCELERATOR_KEY                 = 'cycle-zone-windows-accelerator'; // [cite: 519]
const CYCLE_BACKWARD_ACCELERATOR_KEY        = 'cycle-zone-windows-backward-accelerator'; // [cite: 520]
const ZONE_GAP_SIZE_KEY                     = 'zone-gap-size'; // [cite: 523]
const SNAP_EVASION_KEY                      = 'snap-evasion-key'; // [cite: 530]
const log = msg => console.log(`[AutoZonerPrefs.GeneralSettings] ${msg}`); // [cite: 531]

export function createGeneralSettingsGroup(settings) {
    const group = new Adw.PreferencesGroup({ title: _('General Settings') }); // [cite: 547]

    // Enable Auto Zoning
    const enableSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); // [cite: 548]
    settings.bind(ENABLE_ZONING_KEY, enableSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); // [cite: 549]
    const enableRow = new Adw.ActionRow({ // [cite: 549]
        title: _('Enable Auto Zoning'), // [cite: 549]
        subtitle: _('Globally enable or disable the extension'), // [cite: 549]
        activatable_widget: enableSwitch // [cite: 549]
    });
    enableRow.add_suffix(enableSwitch); // [cite: 550]
    group.add(enableRow); // [cite: 550]

    // Snap Evasion Key
    const evasionKeyChoices = [ // [cite: 550]
        { value: 'disabled', label: _('Disabled') }, // [cite: 550]
        { value: 'control',  label: _('Control') }, // [cite: 550]
        { value: 'alt',      label: _('Alt') }, // [cite: 550]
        { value: 'shift',    label: _('Shift') }, // [cite: 550]
        { value: 'super',    label: _('Super (Windows/Cmd)') } // [cite: 551]
    ];
    const evasionKeyModel = new Gtk.StringList(); // [cite: 552]
    evasionKeyChoices.forEach(choice => evasionKeyModel.append(choice.label)); // [cite: 552]

    const evasionKeyRow = new Adw.ComboRow({ // [cite: 552]
        title: _('Snap Evasion Key'), // [cite: 552]
        subtitle: _('Hold this key while dragging to prevent snapping'), // [cite: 552]
        model: evasionKeyModel, // [cite: 552]
    });
    const currentEvasionKey = settings.get_string(SNAP_EVASION_KEY); // [cite: 553]
    let currentEvasionKeyIndex = evasionKeyChoices.findIndex(c => c.value === currentEvasionKey); // [cite: 554]
    if (currentEvasionKeyIndex === -1) currentEvasionKeyIndex = 0; // [cite: 554]
    evasionKeyRow.selected = currentEvasionKeyIndex; // [cite: 555]
    evasionKeyRow.connect('notify::selected', () => { // [cite: 556]
        const selectedIndex = evasionKeyRow.selected; // [cite: 556]
        if (selectedIndex >= 0 && selectedIndex < evasionKeyChoices.length) { // [cite: 556]
            settings.set_string(SNAP_EVASION_KEY, evasionKeyChoices[selectedIndex].value); // [cite: 556]
        }
    });
    const evasionKeySettingChangedId = settings.connect(`changed::${SNAP_EVASION_KEY}`, () => { // [cite: 565]
        const updatedKey = settings.get_string(SNAP_EVASION_KEY); // [cite: 565]
        let updatedIndex = evasionKeyChoices.findIndex(c => c.value === updatedKey); // [cite: 565]
        if (updatedIndex === -1) updatedIndex = 0; // [cite: 565]
        if (evasionKeyRow.selected !== updatedIndex) { // [cite: 565]
            evasionKeyRow.selected = updatedIndex; // [cite: 566]
        }
    });
    // Disconnect signal handled by parent AutoZonerPrefs window closure [cite: 567, 568, 610]
    group.add(evasionKeyRow); // [cite: 569]

    // Highlight on Hover
    const hoverSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); // [cite: 570]
    settings.bind(HIGHLIGHT_ON_HOVER_KEY, hoverSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); // [cite: 571]
    const hoverRow = new Adw.ActionRow({ // [cite: 571]
        title: _('Highlight Zone on Hover'), // [cite: 571]
        subtitle: _('Visually highlight a zone when dragging a window over it'), // [cite: 571]
        activatable_widget: hoverSwitch // [cite: 571]
    });
    hoverRow.add_suffix(hoverSwitch); // [cite: 572]
    group.add(hoverRow); // [cite: 572]

    // Restore Original Size on Untile
    const restoreSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); // [cite: 572]
    settings.bind(RESTORE_ON_UNTILE_KEY, restoreSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); // [cite: 573]
    const restoreRow = new Adw.ActionRow({ // [cite: 573]
        title: _('Restore Original Size on Untile'), // [cite: 573]
        subtitle: _('When a window leaves all zones, restore its original size/position'), // [cite: 573]
        activatable_widget: restoreSwitch // [cite: 573]
    });
    restoreRow.add_suffix(restoreSwitch); // [cite: 574]
    group.add(restoreRow); // [cite: 574]

    // Tile New Windows
    const tileSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER }); // [cite: 574]
    settings.bind(TILE_NEW_WINDOWS_KEY, tileSwitch, 'active', Gio.SettingsBindFlags.DEFAULT); // [cite: 575]
    const tileRow = new Adw.ActionRow({ // [cite: 575]
        title: _('Tile New Windows'), // [cite: 575]
        subtitle: _('Automatically tile newly opened windows if they fall into a zone'), // [cite: 575]
        activatable_widget: tileSwitch // [cite: 575]
    });
    tileRow.add_suffix(tileSwitch); // [cite: 576]
    group.add(tileRow); // [cite: 576]

    // Cycle Zone Windows Shortcut (forward)
    const accelEntry = new Gtk.Entry({ // [cite: 576]
        hexpand: true, // [cite: 576]
        placeholder_text: '<Control><Alt>8' // [cite: 576]
    });
    const existing = settings.get_strv(CYCLE_ACCELERATOR_KEY); // [cite: 577]
    accelEntry.set_text(existing[0] || ''); // [cite: 577]
    accelEntry.connect('changed', () => { // [cite: 577]
        const text = accelEntry.get_text().trim(); // [cite: 577]
        if (text) { // [cite: 577]
            settings.set_strv(CYCLE_ACCELERATOR_KEY, [ text ]); // [cite: 577]
            log(`Set cycle shortcut: ${text}`); // [cite: 578]
        } else {
            settings.set_strv(CYCLE_ACCELERATOR_KEY, []); // [cite: 578]
        }
    });
    const accelRow = new Adw.ActionRow({ // [cite: 579]
        title: _('Cycle Zone Windows Shortcut'), // [cite: 579]
        subtitle: _('E.g. <Control><Alt>8 or <Super>grave'), // [cite: 579]
    });
    accelRow.add_suffix(accelEntry); // [cite: 580]
    accelRow.activatable_widget = accelEntry; // [cite: 580]
    group.add(accelRow); // [cite: 580]

    // Cycle Zone Windows Backward Shortcut
    const backwardAccelEntry = new Gtk.Entry({ // [cite: 580]
        hexpand: true, // [cite: 580]
        placeholder_text: '<Control><Alt>9' // [cite: 580]
    });
    const existingBackward = settings.get_strv(CYCLE_BACKWARD_ACCELERATOR_KEY); // [cite: 581]
    backwardAccelEntry.set_text(existingBackward[0] || ''); // [cite: 581]
    backwardAccelEntry.connect('changed', () => { // [cite: 581]
        const text = backwardAccelEntry.get_text().trim(); // [cite: 581]
        if (text) { // [cite: 581]
            settings.set_strv(CYCLE_BACKWARD_ACCELERATOR_KEY, [ text ]); // [cite: 581]
            log(`Set backward cycle shortcut: ${text}`); // [cite: 581]
        } else {
            settings.set_strv(CYCLE_BACKWARD_ACCELERATOR_KEY, []); // [cite: 582]
        }
    });
    const backwardAccelRow = new Adw.ActionRow({ // [cite: 583]
        title: _('Cycle Zone Windows Backward Shortcut'), // [cite: 583]
        subtitle: _('E.g. <Control><Shift><Alt>9 or <Super><Shift>grave'), // [cite: 583]
    });
    backwardAccelRow.add_suffix(backwardAccelEntry); // [cite: 584]
    backwardAccelRow.activatable_widget = backwardAccelEntry; // [cite: 584]
    group.add(backwardAccelRow); // [cite: 584]
    
    // Zone Gap Size
    const gapSpin = Gtk.SpinButton.new_with_range(0, 50, 1); // [cite: 589]
    settings.bind(ZONE_GAP_SIZE_KEY, gapSpin, 'value', Gio.SettingsBindFlags.DEFAULT); // [cite: 590]
    const gapRow = new Adw.ActionRow({ // [cite: 590]
        title: _('Zone Gap Size (px)'), // [cite: 590]
        subtitle: _('Gap around zones. 0 for no gaps. Re-snap windows to apply.'), // [cite: 590]
        activatable_widget: gapSpin // [cite: 590]
    });
    gapRow.add_suffix(gapSpin); // [cite: 591]
    group.add(gapRow); // [cite: 595]

    return { group, evasionKeySettingChangedId };
}
