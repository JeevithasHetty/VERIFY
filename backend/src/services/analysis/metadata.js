import exifr from 'exifr';

/**
 * Known desktop/mobile photo-editing software strings that, if present
 * in EXIF Software/ProcessingSoftware tags, are treated as a WEAK signal
 * that the image may have been edited. This is not proof of tampering -
 * plenty of legitimate photos pass through resizing/sharing tools.
 */
const EDITING_SOFTWARE_HINTS = [
  'photoshop',
  'gimp',
  'lightroom',
  'snapseed',
  'picsart',
  'facetune',
  'pixlr',
  'affinity photo',
];

export async function analyzeMetadata(buffer) {
  try {
    const data = await exifr.parse(buffer, { gps: true, tiff: true, exif: true });

    if (!data) {
      return {
        available: false,
        cameraMake: null,
        cameraModel: null,
        software: null,
        timestamp: null,
        gpsPresent: false,
        editingSoftwareDetected: false,
      };
    }

    const software = data.Software || data.ProcessingSoftware || null;
    const editingSoftwareDetected = Boolean(
      software && EDITING_SOFTWARE_HINTS.some((hint) => software.toLowerCase().includes(hint))
    );

    return {
      available: true,
      cameraMake: data.Make || null,
      cameraModel: data.Model || null,
      software,
      timestamp: data.DateTimeOriginal || data.CreateDate || null,
      // IMPORTANT: exact GPS coordinates are intentionally never returned -
      // only a boolean presence flag, per privacy requirements.
      gpsPresent: Boolean(data.latitude && data.longitude),
      editingSoftwareDetected,
    };
  } catch (err) {
    return {
      available: false,
      error: err.message,
      cameraMake: null,
      cameraModel: null,
      software: null,
      timestamp: null,
      gpsPresent: false,
      editingSoftwareDetected: false,
    };
  }
}

export default analyzeMetadata;
