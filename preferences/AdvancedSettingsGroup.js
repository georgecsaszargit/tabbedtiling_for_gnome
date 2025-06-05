// ./preferences/AdvancedSettingsGroup.js
import Adw from 'gi://Adw'; 
import Gtk from 'gi://Gtk'; 
import Gio from 'gi://Gio'; 
import GLib from 'gi://GLib';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

const log = msg => console.log(`[TabbedTilingPrefs.AdvancedSettings] ${msg}`); 

export function createAdvancedSettingsGroup(settings, extensionPath) {
    const group = new Adw.PreferencesGroup({ 
        title: _('Advanced Settings'),
        description: _('Advanced configuration options and information')
    }); 

    // App Name Exceptions Management
    const exceptionsRow = new Adw.ActionRow({
        title: _('App Name Exceptions'),
        subtitle: _('Applications that show window title instead of app name in tabs')
    });

    const manageExceptionsButton = new Gtk.Button({
        label: _('Manage Exceptions'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat']
    });

    manageExceptionsButton.connect('clicked', () => {
        _showExceptionsDialog(settings, extensionPath, exceptionsRow.get_root());
    });

    exceptionsRow.add_suffix(manageExceptionsButton);
    group.add(exceptionsRow);

    // Extension Information
    const infoRow = new Adw.ActionRow({
        title: _('Extension Information'),
        subtitle: _('View extension details and help information')
    });

    const infoButton = new Gtk.Button({
        icon_name: 'help-about-symbolic',
        valign: Gtk.Align.CENTER,
        tooltip_text: _('Show extension information'),
        css_classes: ['flat', 'circular']
    });

    infoButton.connect('clicked', () => {
        _showInfoDialog(infoRow.get_root());
    });

    infoRow.add_suffix(infoButton);
    group.add(infoRow);

    // Debug Information
    const debugRow = new Adw.ActionRow({
        title: _('Debug Information'),
        subtitle: _('View system and extension debug information')
    });

    const debugButton = new Gtk.Button({
        icon_name: 'applications-debugging-symbolic',
        valign: Gtk.Align.CENTER,
        tooltip_text: _('Show debug information'),
        css_classes: ['flat', 'circular']
    });

    debugButton.connect('clicked', () => {
        _showDebugDialog(debugRow.get_root());
    });

    debugRow.add_suffix(debugButton);
    group.add(debugRow);

    return group;
}

function _showExceptionsDialog(settings, extensionPath, parentWindow) {
    const dialog = new Adw.Window({
        title: _('App Name Exceptions'),
        default_width: 500,
        default_height: 400,
        modal: true,
        transient_for: parentWindow
    });

    const headerBar = new Adw.HeaderBar();
    dialog.set_titlebar(headerBar);

    const page = new Adw.PreferencesPage();
    dialog.set_content(page);

    const group = new Adw.PreferencesGroup({
        title: _('Exception List'),
        description: _('Applications listed here will show their window title instead of app name in tabs')
    });
    page.add(group);

    // Load current exceptions
    const exceptionsFile = Gio.File.new_for_path(GLib.build_filenamev([extensionPath, 'app_name_exceptions.json']));
    let exceptions = [];
    
    try {
        if (exceptionsFile.query_exists(null)) {
            const [ok, contents] = exceptionsFile.load_contents(null);
            if (ok) {
                const json = new TextDecoder().decode(contents).trim();
                exceptions = JSON.parse(json);
            }
        }
    } catch (e) {
        log(`Error loading exceptions: ${e}`);
    }

    // Add current exceptions to UI
    exceptions.forEach(appId => {
        const row = new Adw.ActionRow({
            title: appId
        });
        
        const removeButton = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'circular', 'destructive-action']
        });
        
        removeButton.connect('clicked', () => {
            group.remove(row);
            _saveExceptions(group, exceptionsFile);
        });
        
        row.add_suffix(removeButton);
        group.add(row);
    });

    // Add new exception section
    const addGroup = new Adw.PreferencesGroup({
        title: _('Add New Exception')
    });
    page.add(addGroup);

    const addRow = new Adw.ActionRow({
        title: _('Application ID'),
        subtitle: _('e.g., org.gnome.TextEditor or firefox.desktop')
    });

    const entry = new Gtk.Entry({
        placeholder_text: _('Enter application ID'),
        hexpand: true
    });

    const addButton = new Gtk.Button({
        label: _('Add'),
        valign: Gtk.Align.CENTER,
        css_classes: ['suggested-action']
    });

    addButton.connect('clicked', () => {
        const appId = entry.get_text().trim();
        if (appId) {
            const newRow = new Adw.ActionRow({
                title: appId
            });
            
            const removeButton = new Gtk.Button({
                icon_name: 'edit-delete-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'circular', 'destructive-action']
            });
            
            removeButton.connect('clicked', () => {
                group.remove(newRow);
                _saveExceptions(group, exceptionsFile);
            });
            
            newRow.add_suffix(removeButton);
            group.add(newRow);
            entry.set_text('');
            _saveExceptions(group, exceptionsFile);
        }
    });

    addRow.add_suffix(entry);
    addRow.add_suffix(addButton);
    addGroup.add(addRow);

    dialog.present();
}

function _saveExceptions(group, exceptionsFile) {
    const exceptions = [];
    let child = group.get_first_child();
    while (child) {
        if (child instanceof Adw.ActionRow) {
            exceptions.push(child.title);
        }
        child = child.get_next_sibling();
    }

    try {
        const json = JSON.stringify(exceptions, null, 2);
        exceptionsFile.replace_contents(
            new TextEncoder().encode(json),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        log(`Saved ${exceptions.length} exceptions`);
    } catch (e) {
        log(`Error saving exceptions: ${e}`);
    }
}

function _showInfoDialog(parentWindow) {
    const dialog = new Adw.MessageDialog({
        heading: _("TabbedTiling Extension"),
        body: _(`Version: 1.0
Author: TabbedTiling Team

Features:
• Automatic window tiling into predefined zones
• Tabbed interface for managing multiple windows per zone
• Customizable tab appearance and behavior
• Zone splitting functionality
• Keyboard shortcuts for window cycling
• Full monitor coordinate system for precise zone placement

For support and documentation, visit the extension homepage.`),
        transient_for: parentWindow,
        modal: true
    });
    dialog.add_response("ok", _("OK"));
    dialog.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED);
    dialog.connect("response", (d) => d.destroy());
    dialog.present();
}

function _showDebugDialog(parentWindow) {
    const display = parentWindow.get_display();
    const monitors = display.get_monitors();
    const monitorCount = monitors.get_n_items();
    
    let monitorInfo = '';
    for (let i = 0; i < monitorCount; i++) {
        const monitor = monitors.get_item(i);
        const geometry = monitor.get_geometry();
        monitorInfo += `Monitor ${i}:\n`;
        monitorInfo += `  Geometry: ${geometry.width}x${geometry.height} at (${geometry.x}, ${geometry.y})\n`;
        monitorInfo += `  Scale Factor: ${monitor.get_scale_factor()}\n\n`;
    }

    const dialog = new Adw.MessageDialog({
        heading: _("Debug Information"),
        body: _(`System Information:
${monitorInfo}Shell Version: ${global.session.mode || 'Unknown'}
Extension Path: Available in console logs

Zone coordinates should be relative to the monitor geometry shown above.`),
        transient_for: parentWindow,
        modal: true
    });
    dialog.add_response("ok", _("OK"));
    dialog.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED);
    dialog.connect("response", (d) => d.destroy());
    dialog.present();
}
