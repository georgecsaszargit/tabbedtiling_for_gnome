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
