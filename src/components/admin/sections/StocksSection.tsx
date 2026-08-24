"use client";

import React, { useState } from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

interface StockRow {
  id: string;
  symbol: string;
  name: string;
  description: string;
  isActive: boolean;
}

/**
 * Full stock lifecycle management: add, rename (name + symbol),
 * deactivate/reactivate and permanently remove securities.
 */
export const StocksSection: React.FC = () => {
  const { stocks, addStock, editStock, toggleStockActive, removeStock, addToast } =
    useSandboxStore();

  const [showAddStockDialog, setShowAddStockDialog] = useState(false);
  const [showEditStockDialog, setShowEditStockDialog] = useState(false);
  const [showToggleStockDialog, setShowToggleStockDialog] = useState(false);
  const [showRemoveStockDialog, setShowRemoveStockDialog] = useState(false);
  const [selectedStockForEdit, setSelectedStockForEdit] = useState<StockRow | null>(null);
  const [newStockSymbol, setNewStockSymbol] = useState("");
  const [newStockName, setNewStockName] = useState("");
  const [newStockDescription, setNewStockDescription] = useState("");
  const [newStockPrice, setNewStockPrice] = useState("1000");
  const [editStockSymbol, setEditStockSymbol] = useState("");
  const [editStockName, setEditStockName] = useState("");
  const [editStockDescription, setEditStockDescription] = useState("");

  const handleAddStock = async () => {
    const price = parseFloat(newStockPrice);
    if (!newStockSymbol.trim() || !newStockName.trim() || !Number.isFinite(price) || price <= 0) {
      addToast("error", "Invalid Input", "Symbol, name, and a valid price are required.");
      return;
    }
    await addStock({
      symbol: newStockSymbol.trim().toUpperCase(),
      name: newStockName.trim(),
      description: newStockDescription.trim(),
      currentPrice: price,
    });
    setNewStockSymbol("");
    setNewStockName("");
    setNewStockDescription("");
    setNewStockPrice("1000");
    setShowAddStockDialog(false);
  };

  const handleEditStock = async () => {
    if (!selectedStockForEdit || !editStockName.trim() || !editStockSymbol.trim()) {
      addToast("error", "Invalid Input", "Symbol and stock name are required.");
      return;
    }
    await editStock(selectedStockForEdit.id, {
      symbol: editStockSymbol.trim().toUpperCase(),
      name: editStockName.trim(),
      description: editStockDescription.trim(),
    });
    setEditStockSymbol("");
    setEditStockName("");
    setEditStockDescription("");
    setSelectedStockForEdit(null);
    setShowEditStockDialog(false);
  };

  const handleToggleStock = async () => {
    if (!selectedStockForEdit) return;
    await toggleStockActive(selectedStockForEdit.id, !selectedStockForEdit.isActive);
    setSelectedStockForEdit(null);
    setShowToggleStockDialog(false);
  };

  const openEditStockDialog = (stock: StockRow) => {
    setSelectedStockForEdit(stock);
    setEditStockSymbol(stock.symbol);
    setEditStockName(stock.name);
    setEditStockDescription(stock.description);
    setShowEditStockDialog(true);
  };

  const openToggleStockDialog = (stock: StockRow) => {
    setSelectedStockForEdit(stock);
    setShowToggleStockDialog(true);
  };

  const openRemoveStockDialog = (stock: { id: string; symbol: string }) => {
    setSelectedStockForEdit({ ...stock, name: "", description: "", isActive: true });
    setShowRemoveStockDialog(true);
  };

  const handleRemoveStock = async () => {
    if (!selectedStockForEdit) return;
    const ok = await removeStock(selectedStockForEdit.id);
    if (ok) {
      setSelectedStockForEdit(null);
      setShowRemoveStockDialog(false);
    }
  };

  return (
    <>
      <Panel>
        <PanelHeader>
          <PanelTitle>Stock Management</PanelTitle>
          <span className="text-xs text-muted-foreground">
            Add, rename, or toggle stock activation. Changes broadcast live.
          </span>
        </PanelHeader>
        <div className="p-4 space-y-4">
          {/* Add Stock */}
          <div className="flex items-center gap-2">
            <Button variant="buy" onClick={() => setShowAddStockDialog(true)}>
              Add Stock
            </Button>
          </div>

          {/* Stocks Table */}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => (
                <TableRow key={stock.id}>
                  <TableCell>
                    <span className="text-sm font-semibold text-foreground">{stock.symbol}</span>
                  </TableCell>
                  <TableCell className="text-foreground">{stock.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={stock.isActive ? "buy" : "secondary"}>
                      {stock.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() =>
                          openEditStockDialog({
                            id: stock.id,
                            symbol: stock.symbol,
                            name: stock.name,
                            description: stock.description ?? "",
                            isActive: stock.isActive,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant={stock.isActive ? "warn" : "buy"}
                        size="xs"
                        onClick={() =>
                          openToggleStockDialog({
                            id: stock.id,
                            symbol: stock.symbol,
                            name: stock.name,
                            description: stock.description ?? "",
                            isActive: stock.isActive,
                          })
                        }
                      >
                        {stock.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => openRemoveStockDialog({ id: stock.id, symbol: stock.symbol })}
                      >
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* Add stock dialog */}
      <Dialog open={showAddStockDialog} onOpenChange={setShowAddStockDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Stock</DialogTitle>
            <DialogDescription>
              Lists a new security on the market at its opening price and broadcasts it live.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-stock-symbol">Symbol</Label>
                <Input
                  id="new-stock-symbol"
                  placeholder="RELIANCE"
                  value={newStockSymbol}
                  onChange={(e) => setNewStockSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-stock-price">Opening price (₹)</Label>
                <NumberInput
                  id="new-stock-price"
                  min={1}
                  value={newStockPrice}
                  onChange={(e) => setNewStockPrice(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-stock-name">Company name</Label>
              <Input
                id="new-stock-name"
                placeholder="Reliance Industries Ltd"
                value={newStockName}
                onChange={(e) => setNewStockName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-stock-description">Description (optional)</Label>
              <Input
                id="new-stock-description"
                value={newStockDescription}
                onChange={(e) => setNewStockDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddStockDialog(false)}>
              Cancel
            </Button>
            <Button variant="buy" onClick={handleAddStock}>
              Add Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit stock dialog */}
      <Dialog open={showEditStockDialog} onOpenChange={setShowEditStockDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {selectedStockForEdit?.symbol}</DialogTitle>
            <DialogDescription>
              Rename the company, change its ticker symbol, or update the description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stock-symbol">Symbol</Label>
              <Input
                id="edit-stock-symbol"
                value={editStockSymbol}
                onChange={(e) => setEditStockSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stock-name">Company name</Label>
              <Input
                id="edit-stock-name"
                value={editStockName}
                onChange={(e) => setEditStockName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-stock-description">Description</Label>
              <Input
                id="edit-stock-description"
                value={editStockDescription}
                onChange={(e) => setEditStockDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowEditStockDialog(false)}>
              Cancel
            </Button>
            <Button variant="buy" onClick={handleEditStock}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate / reactivate confirmation */}
      <Dialog open={showToggleStockDialog} onOpenChange={setShowToggleStockDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedStockForEdit?.isActive ? "Deactivate" : "Reactivate"}{" "}
              {selectedStockForEdit?.symbol}?
            </DialogTitle>
            <DialogDescription>
              {selectedStockForEdit?.isActive
                ? "The stock disappears from the participant market immediately. Trade history is preserved and it can be reactivated later."
                : "The stock reappears on the participant market at its current stored price."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowToggleStockDialog(false)}>
              Cancel
            </Button>
            <Button
              variant={selectedStockForEdit?.isActive ? "destructive" : "buy"}
              onClick={handleToggleStock}
            >
              {selectedStockForEdit?.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove (hard delete) confirmation */}
      <AlertDialog open={showRemoveStockDialog} onOpenChange={setShowRemoveStockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently remove {selectedStockForEdit?.symbol}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the stock from the database along with every quote, holding, trade,
              ledger entry and dividend record for it. Team cash balances are adjusted to stay
              consistent. This cannot be undone — use Deactivate instead for a reversible hide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRemoveStock}>
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
