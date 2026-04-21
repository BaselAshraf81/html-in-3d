import { saveTextFile, openTextFile } from "./fileIO";

/**
 * Project file format for VibeCanvas Studio (.vibecanvas JSON)
 */

export interface ProjectData {
  version: string;
  name: string;
  savedAt: string;
  scene: {
    objects: any[];
    gltfModels: any[];
    htmlPanels: any[];
    textureAssignments: any[];
  };
}

const FILE_FILTERS = [
  { name: "VibeCanvas Project", extensions: ["vibecanvas", "json"] },
];

export async function saveProject(
  name: string,
  objects: any[],
  gltfModels: any[],
  htmlPanels: any[],
  textureAssignments: any[]
): Promise<string | null> {
  const project: ProjectData = {
    version: "1.0.0",
    name,
    savedAt: new Date().toISOString(),
    scene: { objects, gltfModels, htmlPanels, textureAssignments },
  };

  return saveTextFile(
    JSON.stringify(project, null, 2),
    `${name || "untitled"}.vibecanvas`,
    FILE_FILTERS
  );
}

export async function loadProject(): Promise<ProjectData | null> {
  const result = await openTextFile(FILE_FILTERS);
  if (!result) return null;

  const project: ProjectData = JSON.parse(result.content);

  if (!project.version || !project.scene) {
    throw new Error("Invalid project file format");
  }

  return project;
}
