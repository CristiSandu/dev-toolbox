export function generateTaskNames(taskNumber: string, taskName: string, branchType: string) {
  // Preserve the existing punctuation and whitespace behavior for saved-task compatibility.
  const normalizedName = taskName.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-");
  return {
    branch: `${branchType}/${taskNumber}-${normalizedName}`,
    prTitle: `${taskNumber}: ${taskName}`,
  };
}
