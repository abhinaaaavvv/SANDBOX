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

export const TransactionHistory: React.FC = () => {
  const { transactions } = useSandboxStore();

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Transaction History</PanelTitle>
        <PanelMeta>{transactions.length} entries</PanelMeta>
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
          {transactions.map((tx) => (
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
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No transactions logged
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
};
