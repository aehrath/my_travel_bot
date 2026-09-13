// Google-native documents, folders, and shortcuts have no downloadable vault blob.
// Keep legacy uploads with unspecified MIME types; their envelope is still validated.
export const isDownloadableDriveCopy=(file:{mimeType?:string})=>!file.mimeType?.startsWith("application/vnd.google-apps.");
