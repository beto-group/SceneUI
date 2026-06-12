```datacorejsx
const currentFilePath = dc.useCurrentPath();
const folderPath = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf("/")) : "";
const { View } = await dc.require(folderPath + "/src/index.jsx");
return await View({ folderPath, dc });
```
