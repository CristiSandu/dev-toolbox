interface TextModel {
  getValue(): string;
  setValue(value: string): void;
}

export function syncDiffOriginal(model: TextModel, value: string): void {
  // Replacing identical text resets Monaco's cursor and undo history while typing.
  if (model.getValue() !== value) model.setValue(value);
}
