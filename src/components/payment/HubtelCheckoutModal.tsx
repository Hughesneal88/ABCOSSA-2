import { useState } from "react";
import { ShieldCheck, Loader2, Smartphone, CreditCard, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useCreatePayment, useHubtelSettings } from "@/hooks/usePayments";
import { formatGHS, type PaymentChannel } from "@/lib/hubtelClient";

interface HubtelCheckoutModalProps {
  title?: string;
  defaultAmount?: number;
  paymentType?: "dues" | "event" | "donation" | "voting";
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function HubtelCheckoutModal({
  title = "Make Payment",
  defaultAmount = 50,
  paymentType = "dues",
  trigger,
  onSuccess,
}: HubtelCheckoutModalProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultAmount);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [channel, setChannel] = useState<PaymentChannel>("mtn-gh");
  const [completed, setCompleted] = useState(false);

  const { data: hubtelSettings } = useHubtelSettings();
  const createPaymentMutation = useCreatePayment();

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerEmail || !customerPhone) {
      toast.error("Please fill in all required customer details.");
      return;
    }

    createPaymentMutation.mutate(
      {
        amount: Number(amount),
        customerName,
        customerEmail,
        customerPhone,
        paymentType,
        paymentChannel: channel,
        description: `${title} - ${paymentType.toUpperCase()}`,
      },
      {
        onSuccess: (res) => {
          if (res.checkoutUrl) {
            toast.info("Redirecting to Hubtel Payment Checkout...");
            window.location.href = res.checkoutUrl;
          } else {
            setCompleted(true);
            toast.success("Payment initiated successfully via Hubtel Mobile Money!");
            if (onSuccess) onSuccess();
          }
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Payment initiation failed");
        },
      }
    );
  };

  const handleReset = () => {
    setCompleted(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
            <Smartphone className="w-4 h-4" /> Pay with Hubtel MoMo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border/60">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Hubtel Secured (Merchant #{hubtelSettings?.merchantAccountNumber || "2019842"})
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground mt-2">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Pay securely using MTN Mobile Money, Telecel Cash, AT Money, or Debit/Credit Card.
          </DialogDescription>
        </DialogHeader>

        {completed ? (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-foreground">Payment Initiated!</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Please check your mobile phone ({customerPhone}) for the Hubtel Mobile Money authorization prompt.
            </p>
            <Button onClick={handleReset} className="w-full text-xs font-semibold">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handlePay} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs">Amount (GHS)</Label>
              <Input
                type="number"
                min={1}
                step="any"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 font-bold text-lg"
                required
              />
            </div>

            <div>
              <Label className="text-xs">Full Name</Label>
              <Input
                placeholder="e.g. Kwabena Mensah"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Email Address</Label>
                <Input
                  type="email"
                  placeholder="kwabena@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">MoMo Phone Number</Label>
                <Input
                  type="tel"
                  placeholder="024XXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={channel} onValueChange={(val) => setChannel(val as PaymentChannel)}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn-gh">MTN Mobile Money</SelectItem>
                  <SelectItem value="telecel-gh">Telecel Cash (Vodafone)</SelectItem>
                  <SelectItem value="at-gh">AT Money (AirtelTigo)</SelectItem>
                  <SelectItem value="card">Visa / Mastercard Credit or Debit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total Payable</span>
              <span className="font-extrabold text-foreground text-sm">{formatGHS(amount)}</span>
            </div>

            <Button
              type="submit"
              disabled={createPaymentMutation.isPending}
              className="w-full text-xs font-semibold rounded-xl gap-2"
            >
              {createPaymentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : channel === "card" ? (
                <CreditCard className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
              Pay {formatGHS(amount)} via Hubtel
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
