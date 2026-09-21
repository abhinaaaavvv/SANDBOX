"use client";

import React from "react";
import { useSandboxStore } from "@/context/SandboxContext";
import { formatINR } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader, PanelMeta, PanelTitle } from "@/components/ui/panel";

interface TransactionHistoryProps {
  limit?: number;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ limit }) => {
  const { transactions } = useSandboxStore();

  const visible = limit ? transactions.slice(0, limit) : transactions;
  const isTruncated = limit != null && transactions.length > limit;

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Transaction History</PanelTitle>
        <PanelMeta>
          {isTruncated
            ? `Showing ${limit} of ${transactions.length}`
            : `${transactions.length} entries`}
        </PanelMeta>
      </PanelHeader>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Time</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Security</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead className="text-right">Exec Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((tx) => (
            <TableRow key={tx.id}>
              <TableCell className="text-xs tabular-nums text-muted-foreground">
                {tx.timestamp}
              </TableCell>

              <TableCell>
                <Badge
                  variant={
                    tx.type === "BUY" ? "buy" : tx.type === "DIVIDEND" ? "warn" : "sell"
                  }
                >
                  {tx.type === "BUY" ? "Buy" : tx.type === "DIVIDEND" ? "Dividend" : "Sell"}
                </Badge>
              </TableCell>

              <TableCell className="font-medium text-foreground">{tx.symbol}</TableCell>

              <TableCell className="text-center font-medium tabular-nums text-foreground">
                {tx.quantity}
              </TableCell>

              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatINR(tx.price)}
              </TableCell>

              <TableCell className="text-right font-semibold tabular-nums text-foreground">
                {formatINR(tx.total)}
              </TableCell>
            </TableRow>
          ))}

          {transactions.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="font-bodoni py-8 text-center text-sm italic text-muted-foreground">
                No transactions logged
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
};
