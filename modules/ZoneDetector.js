import * as Main from 'resource:///org/gnome/shell/ui/main.js'; 
const log = (prefix, msg) => console.log(`[TabbedTilingPrefs.ZoneDetector.${prefix}] ${msg}`); 

function isPointInsideRect(point, rect) {
    const check = point.x >= rect.x && point.x <= rect.x + rect.width && 
                  point.y >= rect.y && point.y <= rect.y + rect.height; 
    return check; 
}

export class ZoneDetector {
    constructor() {
        // log('constructor', 'Initialized'); 
    }

    findTargetZone(activeZones, point, monitorIndex) { 
        // Get monitor geometry instead of work area
        const monitor = Main.layoutManager.monitors[monitorIndex];
        if (!monitor) {
            log('findTargetZone', `Invalid monitor index ${monitorIndex}`);
            return null;
        }
        
        log('findTargetZone', `Searching on monitor ${monitorIndex} (Geometry: X:${monitor.x} Y:${monitor.y} W:${monitor.width} H:${monitor.height}) for point X:${point.x} Y:${point.y}`); 
        log('findTargetZone', `Available zones for this search: ${JSON.stringify(activeZones.filter(z => z.monitorIndex === monitorIndex))}`); 
        
        for (const zone of activeZones) { 
            if (zone.monitorIndex === monitorIndex) { 
                const absoluteZoneRect = { 
                    x: monitor.x + zone.x, 
                    y: monitor.y + zone.y, 
                    width: zone.width, 
                    height: zone.height 
                };
                log('findTargetZone', `Checking zone "${zone.name || 'Unnamed'}": AbsRect: X:${absoluteZoneRect.x} Y:${absoluteZoneRect.y} W:${absoluteZoneRect.width} H:${absoluteZoneRect.height}`); 
                if (isPointInsideRect(point, absoluteZoneRect)) { 
                    log('findTargetZone', `Point IS INSIDE zone "${zone.name || 'Unnamed'}"`); 
                    return zone; 
                }
            }
        }
        log('findTargetZone', `No target zone found for point X:${point.x} Y:${point.y} on monitor ${monitorIndex}`); 
        return null; 
    }
}
