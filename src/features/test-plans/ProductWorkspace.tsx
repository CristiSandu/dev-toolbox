import { useEffect, useState } from "react";
import {
  Copy,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  WandSparkles,
  ArrowLeft,
  ListPlus,
  MoreHorizontal,
  Maximize,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { EmptyState } from "@/components/workspace";
import {
  CODE_TYPES,
  type CodeType,
} from "@/components/code-generator/codegen-types";
import {
  copySvgFromDataUrl,
  downloadPngFromDataUrl,
  downloadSvgFromDataUrl,
} from "@/lib/barcode-utils";
import { svgForCode } from "@/lib/code-generation";
import { confirmAction } from "@/lib/confirm-action";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  generationKey,
  LIMITS,
  newList,
  parseProducts,
  productLabel,
  safeImageUrl,
  type CaseContent,
  type Product,
} from "./model";
import { ProductImage } from "./ProductImage";
import { useProductCodes } from "./useProductCodes";

interface Props {
  content: CaseContent;
  onChange: (content: CaseContent) => void;
  disabled: boolean;
  active: boolean;
}
export function ProductWorkspace({
  content,
  onChange,
  disabled,
  active,
}: Props) {
  const [listId, setListId] = useState(
    content.lists.find((list) => list.products.length)?.id ??
      content.lists[0].id,
  );
  const list =
    content.lists.find((list) => list.id === listId) ?? content.lists[0];
  const [selectedId, setSelectedId] = useState<string | null>(
      list.products[0]?.id ?? null,
    ),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false),
    [detail, setDetail] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const [bulk, setBulk] = useState(false),
    [bulkText, setBulkText] = useState(""),
    [bulkMode, setBulkMode] = useState<"lines" | "json">("lines"),
    [bulkType, setBulkType] = useState<CodeType>("QR Code"),
    [bulkError, setBulkError] = useState("");
  const [listDialog, setListDialog] = useState<"new" | "rename" | null>(null),
    [name, setName] = useState("");
  const mobile = useIsMobile();
  const filtered = list.products.filter((product) =>
    `${product.title} ${product.text} ${product.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected = filtered.find((product) => product.id === selectedId);
  const allProducts = content.lists.flatMap((list) => list.products);
  const { codes, busy, progress, generate, selectedCode } = useProductCodes(
    allProducts,
    selected,
    active && !editing,
  );
  useEffect(() => {
    if (selectedId && !filtered.some((product) => product.id === selectedId))
      setSelectedId(null);
  }, [selectedId, filtered]);
  const updateProducts = (products: Product[]) =>
    onChange({
      ...content,
      lists: content.lists.map((entry) =>
        entry.id === list.id ? { ...entry, products } : entry,
      ),
    });
  const updateProduct = (change: Partial<Product>) => {
    if (selected)
      updateProducts(
        list.products.map((product) =>
          product.id === selected.id ? { ...product, ...change } : product,
        ),
      );
  };
  const chooseList = (id: string) => {
    const next = content.lists.find((list) => list.id === id)!;
    setListId(id);
    setSearch("");
    setSelectedId(next.products[0]?.id ?? null);
    setEditing(false);
    setDetail(false);
  };
  const addProduct = () => {
    if (allProducts.length >= LIMITS.products) {
      toast.error("A case supports up to 5,000 products.");
      return;
    }
    const product: Product = {
      id: crypto.randomUUID(),
      title: "",
      text: "",
      type: "QR Code",
      imageUrl: "",
      description: "",
    };
    updateProducts([...list.products, product]);
    setSearch("");
    setSelectedId(product.id);
    setEditing(true);
    setDetail(false);
  };
  const deleteProduct = async () => {
    if (
      !selected ||
      !(await confirmAction(
        `Delete “${productLabel(selected) || "Untitled product"}” from this list?`,
        "Delete product?",
      ))
    )
      return;
    const index = list.products.findIndex(
        (product) => product.id === selected.id,
      ),
      next = list.products.filter((product) => product.id !== selected.id);
    updateProducts(next);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
    setEditing(false);
    setDetail(false);
  };
  const deleteList = async () => {
    if (content.lists.length === 1) {
      toast.error("Keep at least one code list in this case.");
      return;
    }
    if (
      list.products.length &&
      !(await confirmAction(
        `Delete “${list.name}” and its ${list.products.length} products?`,
        "Delete list?",
      ))
    )
      return;
    const next = content.lists.filter((entry) => entry.id !== list.id);
    onChange({ ...content, lists: next });
    setListId(next[0].id);
    setSelectedId(next[0].products[0]?.id ?? null);
    setSearch("");
    setEditing(false);
  };
  const applyBulk = async (replace: boolean) => {
    try {
      const products = parseProducts(bulkText, bulkMode, bulkType);
      if (
        allProducts.length -
          (replace ? list.products.length : 0) +
          products.length >
        LIMITS.products
      )
        throw new Error("A case supports up to 5,000 products.");
      if (
        replace &&
        list.products.length &&
        !(await confirmAction(
          `Replace all ${list.products.length} products in “${list.name}”?`,
          "Replace list?",
        ))
      )
        return;
      updateProducts(replace ? products : [...list.products, ...products]);
      setSelectedId(products[0].id);
      setSearch("");
      setBulk(false);
      setBulkText("");
      setBulkError("");
      setEditing(false);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : String(error));
    }
  };
  const closeBulk = async () => {
    if (
      !bulkText ||
      (await confirmAction(
        "Discard the unapplied bulk input?",
        "Discard bulk input?",
      ))
    ) {
      setBulk(false);
      setBulkText("");
      setBulkError("");
    }
  };
  const saveListName = () => {
    if (!name.trim() || [...name].length > 200) return;
    if (listDialog === "new") {
      if (content.lists.length >= LIMITS.lists) {
        toast.error("A case supports up to 100 lists.");
        return;
      }
      const next = newList(name.trim());
      onChange({ ...content, lists: [...content.lists, next] });
      setListId(next.id);
      setSelectedId(null);
      setSearch("");
    } else
      onChange({
        ...content,
        lists: content.lists.map((entry) =>
          entry.id === list.id ? { ...entry, name: name.trim() } : entry,
        ),
      });
    setListDialog(null);
  };
  const result = selectedCode?.result;
  const exportCode = async (format: "png" | "svg" | "copy") => {
    if (!result) return;
    try {
      if (format === "png")
        await downloadPngFromDataUrl(result.dataUrl, result.text);
      else if (format === "svg")
        downloadSvgFromDataUrl(await svgForCode(result), result.text);
      else await copySvgFromDataUrl(await svgForCode(result));
    } catch (error) {
      toast.error("Could not export this code", { description: String(error) });
    }
  };
  const source = (
    <section className="tp-list-pane">
      <div className="tp-list-toolbar">
        <label className="sr-only" id="tp-list-label">
          Code list
        </label>
        <Select value={list.id} onValueChange={chooseList} disabled={disabled}>
          <SelectTrigger aria-labelledby="tp-list-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {content.lists.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name} ({entry.products.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New code list"
          disabled={disabled}
          onClick={() => {
            setName("");
            setListDialog("new");
          }}
        >
          <ListPlus />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="List actions"
              disabled={disabled}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => {
                setName(list.name);
                setListDialog("rename");
              }}
            >
              Rename list
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void deleteList()}
              className="text-destructive"
            >
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="tp-list-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addProduct}
        >
          <Plus />
          Product
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setBulk(true)}
        >
          Bulk input
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || busy || !list.products.length}
          onClick={() => void generate(list.products)}
        >
          <WandSparkles />
          Generate list
        </Button>
      </div>
      <div className="tp-search">
        <Search size={15} aria-hidden="true" />
        <Input
          aria-label="Search products"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search products…"
        />
        <span>
          {filtered.length}/{list.products.length}
        </span>
      </div>
      <div className="tp-products" aria-label="Products">
        {filtered.length ? (
          filtered.map((product) => {
            const code =
              codes[product.id]?.key === generationKey(product)
                ? codes[product.id]
                : undefined;
            return (
              <button
                key={product.id}
                className={`tp-product-row ${selectedId === product.id ? "is-selected" : ""}`}
                aria-pressed={selectedId === product.id}
                onClick={() => {
                  setSelectedId(product.id);
                  setEditing(false);
                  setDetail(true);
                }}
              >
                <ProductImage
                  src={product.imageUrl}
                  title={productLabel(product)}
                  thumbnail
                />
                <span>
                  <strong>{productLabel(product) || "Untitled product"}</strong>
                  <code>{product.text || "Enter a value"}</code>
                  <small className={code?.error ? "text-destructive" : ""}>
                    {product.type} ·{" "}
                    {code?.error
                      ? "Generation failed"
                      : code?.result
                        ? "Generated"
                        : "Not generated"}
                  </small>
                </span>
              </button>
            );
          })
        ) : (
          <EmptyState
            title={search ? "No matching products" : "Add your test products"}
            description={
              search
                ? "Try another title, value, or description."
                : "Add a product or paste a batch, then inspect each code alongside its product image."
            }
          />
        )}
      </div>
      {selected && (
        <div className="tp-list-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setEditing(!editing);
              setDetail(false);
            }}
          >
            <Pencil />
            {editing ? "Done editing" : "Edit product"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => void deleteProduct()}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      )}
      {selected && editing && (
        <div className="tp-product-editor">
          <h3>Edit product</h3>
          <p className="field-hint">
            Changes stay in the case draft until you save.
          </p>
          <fieldset disabled={disabled} className="flex flex-col gap-3">
            <div className="field">
              <label htmlFor="tp-product-title">Product title</label>
              <Input
                id="tp-product-title"
                value={selected.title}
                maxLength={200}
                onChange={(event) =>
                  updateProduct({ title: event.target.value })
                }
              />
            </div>
            <div className="field">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tp-product-value" className="field-label">
                  Encoded value
                </label>
                <output
                  id="tp-product-value-count"
                  htmlFor="tp-product-value"
                  className="field-hint tabular-nums"
                  aria-live="polite"
                >
                  {[...selected.text].length}{" "}
                  {[...selected.text].length === 1 ? "character" : "characters"}
                </output>
              </div>
              <Textarea
                id="tp-product-value"
                aria-describedby="tp-product-value-count"
                value={selected.text}
                maxLength={32000}
                onChange={(event) =>
                  updateProduct({ text: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label id="tp-product-type-label">Code format</label>
              <Select
                value={selected.type}
                onValueChange={(type) =>
                  updateProduct({ type: type as CodeType })
                }
                disabled={disabled}
              >
                <SelectTrigger aria-labelledby="tp-product-type-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="field">
              <label htmlFor="tp-product-image">Image URL</label>
              <Input
                id="tp-product-image"
                type="url"
                value={selected.imageUrl}
                aria-invalid={!safeImageUrl(selected.imageUrl)}
                maxLength={8192}
                placeholder="https://…"
                onChange={(event) =>
                  updateProduct({ imageUrl: event.target.value })
                }
              />
              {!safeImageUrl(selected.imageUrl) && (
                <p className="text-xs text-destructive">
                  Use an absolute HTTP(S) URL without credentials.
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="tp-product-description">
                Product description
              </label>
              <Textarea
                id="tp-product-description"
                value={selected.description}
                maxLength={32000}
                onChange={(event) =>
                  updateProduct({ description: event.target.value })
                }
              />
            </div>
          </fieldset>
        </div>
      )}
    </section>
  );
  const preview = (
    <section className="tp-preview" aria-label="Product preview">
      <div className="pane-heading">
        <h2>Product preview</h2>
        {mobile && (
          <Button variant="ghost" size="sm" onClick={() => setDetail(false)}>
            <ArrowLeft />
            Back to products
          </Button>
        )}
      </div>
      {selected ? (
        <>
          <div className="tp-preview-scroll">
            <header>
              <div className="tp-preview-title">
                <span className="type-badge">{selected.type}</span>
                <h2>{productLabel(selected) || "Untitled product"}</h2>
                {selected.description && <p>{selected.description}</p>}
              </div>
              <ProductImage
                src={selected.imageUrl}
                zoomable
                title={productLabel(selected)}
                thumbnail
              />
            </header>
            <div className="tp-code-and-image">
              <div className="tp-code-area">
                {result ? (
                  <>
                    <div className="tp-code-scroll">
                      <img
                        src={result.dataUrl}
                        alt={`${selected.type} encoding ${selected.text}`}
                      />
                    </div>
                  </>
                ) : (
                  <div className="tp-code-placeholder">
                    <WandSparkles size={28} aria-hidden="true" />
                    <p>
                      {selectedCode?.error ||
                        (busy
                          ? "Generating code…"
                          : editing
                            ? "Finish editing to generate this value."
                            : "Code has not been generated.")}
                    </p>
                  </div>
                )}
                <p className="preview-value">{selected.text}</p>
              </div>
            </div>
            {selectedCode?.error && (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled || busy}
                onClick={() => void generate([selected])}
              >
                Retry generation
              </Button>
            )}
          </div>
          <div className="preview-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={!result}
              onClick={() => setFullscreen(true)}
            >
              <Maximize /> Full screen
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result}
              onClick={() => void exportCode("svg")}
            >
              <Download />
              SVG
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result}
              onClick={() => void exportCode("png")}
            >
              <Download />
              PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result}
              onClick={() => void exportCode("copy")}
            >
              <Copy />
              Copy SVG
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="Select a product"
          description="Choose a product from the list to see its code, image, and title."
        />
      )}
    </section>
  );
  return (
    <div className="tp-product-workspace" hidden={!active}>
      <div className="tp-generation-status" role="status">
        {busy
          ? `Generating ${progress}…`
          : `${allProducts.length} products across ${content.lists.length} ${content.lists.length === 1 ? "list" : "lists"}`}
      </div>
      {mobile ? (
        <div className="tp-mobile-products">
          {detail && !editing ? preview : source}
        </div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId="test-plan-products"
        >
          <ResizablePanel defaultSize={38} minSize={25}>
            {source}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={62} minSize={35}>
            {preview}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
      <Dialog
        open={fullscreen && !!result && active}
        onOpenChange={setFullscreen}
      >
        <DialogContent className="tp-code-fullscreen">
          <DialogTitle>
            {selected ? productLabel(selected) : "Product code"}
          </DialogTitle>
          <DialogDescription>
            {selected?.type} · {selected?.text}
          </DialogDescription>
          <div className="tp-code-scroll">
            {result && (
              <img
                src={result.dataUrl}
                alt={`${selected?.type} encoding ${selected?.text}`}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bulk}
        onOpenChange={(value) => {
          if (!value) void closeBulk();
        }}
      >
        <DialogContent>
          <DialogTitle>Bulk product input</DialogTitle>
          <DialogDescription>
            Append products or replace this list. JSON supports text, type,
            title, imageUrl, and description.
          </DialogDescription>
          <div className="field-grid">
            <div className="field">
              <label id="tp-bulk-mode-label">Input format</label>
              <Select
                value={bulkMode}
                onValueChange={(value) =>
                  setBulkMode(value as "lines" | "json")
                }
              >
                <SelectTrigger aria-labelledby="tp-bulk-mode-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lines">One per line</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {bulkMode === "lines" && (
              <div className="field">
                <label id="tp-bulk-type-label">Code format</label>
                <Select
                  value={bulkType}
                  onValueChange={(value) => setBulkType(value as CodeType)}
                >
                  <SelectTrigger aria-labelledby="tp-bulk-type-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CODE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <label htmlFor="tp-bulk-source">Products</label>
          <Textarea
            id="tp-bulk-source"
            className="tp-bulk-source"
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            placeholder={
              bulkMode === "json"
                ? '[{"text":"5901234123457","type":"EAN-13","title":"Sample product","imageUrl":"https://example.com/product.jpg"}]'
                : "5901234123457\n4006381333931"
            }
          />
          {bulkError && (
            <p role="alert" className="text-destructive text-sm">
              {bulkError}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => void closeBulk()}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void applyBulk(true)}>
              Replace list
            </Button>
            <Button onClick={() => void applyBulk(false)}>
              Append products
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!listDialog}
        onOpenChange={(value) => {
          if (!value) setListDialog(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {listDialog === "new" ? "New code list" : "Rename code list"}
          </DialogTitle>
          <DialogDescription>
            Use a name that identifies this group of test products.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveListName();
            }}
          >
            <div className="field">
              <label htmlFor="tp-list-name">List name</label>
              <Input
                autoFocus
                id="tp-list-name"
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setListDialog(null)}
              >
                Cancel
              </Button>
              <Button disabled={!name.trim()} type="submit">
                {listDialog === "new" ? "Create list" : "Rename list"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
