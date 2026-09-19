export function newVolume(applicationId: string, mountPath: string) {
  const id = crypto.randomUUID();
  return { id, applicationId, mountPath, volumeName: `kuberfy-vol-${id}` };
}
