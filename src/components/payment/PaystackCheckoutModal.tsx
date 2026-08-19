import { useState } from "react";
import { ShieldCheck, Loader2, Smartphone, CreditCard, CheckCircle2, Lock } from "lucide-react";
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
import {
  useCreatePayment,
  useCompletePayment,
  usePaystackSettings,
} from "@/hooks/usePayments";
import {
  formatGHS,
  loadPaystackScript,
  type PaymentChannel,
} from "@/lib/paystackClient";

export interface PaystackCheckoutModalProps {
  title?: string;
  defaultAmount?: number;
  paymentType?: "dues" | "event" | "donation" | "voting";
  trigger?: React.ReactNode;
  onSuccess?: () => void;
  metadata?: Record<string, unknown>;
}

export function PaystackCheckoutModal({
  title = "Make Payment",
  defaultAmount = 50,
  paymentType = "dues",
  trigger,
  onSuccess,
  metadata = {},
}: PaystackCheckoutModalProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultAmount);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [channel, setChannel] = useState<PaymentChannel>("mobile_money");
  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [lastReference, setLastReference] = useState("");

  const { data: paystackSettings } = usePaystackSettings();
  const createPaymentMutation = useCreatePayment();
  const completePaymentMutation = useCompletePayment();

  const isTestMode = paystackSettings?.publicKey?.startsWith("pk_test_");

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim() || !customerEmail.trim() || !customerPhone.trim()) {
      toast.error("Please fill in all required customer details.");
      return;
    }

    if (amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Create transaction in database
      const { payment, reference } = await createPaymentMutation.mutateAsync({
        amount: Number(amount),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        paymentType,
        paymentChannel: channel,
        description: `${title} - ${paymentType.toUpperCase()}`,
        metadata,
      });

      setLastReference(reference);

      // 2. Check if Paystack Public Key is configured
      const publicKey = paystackSettings?.publicKey?.trim();

      if (!publicKey) {
        // Fallback for development / when key is not configured in Staff Portal
        await completePaymentMutation.mutateAsync({
          paymentId: payment.id,
          transactionId: `demo_${Date.now()}`,
          reference,
          channel,
        });

        setCompleted(true);
        setIsProcessing(false);
        toast.success("Payment recorded (Demo Mode). Add your Paystack Public Key in Staff Portal for live payments.");
        if (onSuccess) onSuccess();
        return;
      }

      // 3. Load Paystack Inline script
      const scriptLoaded = await loadPaystackScript();
      if (!scriptLoaded || !window.PaystackPop) {
        throw new Error("Unable to load Paystack payment module. Please check your internet connection.");
      }

      // 4. Trigger Paystack Inline Popup
      const handler = window.PaystackPop.setup({
        key: publicKey,
        email: customerEmail.trim(),
        amount: Math.round(Number(amount) * 100), // Paystack accepts amount in pesewas
        currency: paystackSettings?.currency || "GHS",
        ref: reference,
        firstname: customerName.trim().split(" ")[0] || customerName.trim(),
        lastname: customerName.trim().split(" ").slice(1).join(" ") || undefined,
        phone: customerPhone.trim(),
        channels: channel === "card" ? ["card"] : ["mobile_money", "card"],
        metadata: {
          custom_fields: [
            {
              display_name: "Customer Name",
              variable_name: "customer_name",
              value: customerName.trim(),
            },
            {
              display_name: "Phone Number",
              variable_name: "phone_number",
              value: customerPhone.trim(),
            },
            {
              display_name: "Payment Type",
              variable_name: "payment_type",
              value: paymentType,
            },
            {
              display_name: "Title",
              variable_name: "title",
              value: title,
            },
          ],
          ...metadata,
        },
        callback: async (response) => {
          try {
            await completePaymentMutation.mutateAsync({
              paymentId: payment.id,
              transactionId: response.transaction || response.reference || response.trxref,
              reference: response.reference || reference,
              channel,
            });

            setCompleted(true);
            toast.success("Payment completed successfully via Paystack!");
            if (onSuccess) onSuccess();
          } catch (err) {
            console.error("Error confirming payment:", err);
            toast.success("Payment received! Confirmation is processing.");
            setCompleted(true);
            if (onSuccess) onSuccess();
          } finally {
            setIsProcessing(false);
          }
        },
        onClose: () => {
          setIsProcessing(false);
          toast.info("Payment window closed.");
        },
      });

      handler.openIframe();
    } catch (err) {
      setIsProcessing(false);
      toast.error(err instanceof Error ? err.message : "Payment initialization failed");
    }
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
            <Smartphone className="w-4 h-4" /> Pay with Paystack
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border/60">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Secured by Paystack
              {isTestMode && <span className="ml-1 text-[10px] text-amber-500 font-bold">(Test Mode)</span>}
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground mt-2">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Pay securely with MTN Mobile Money, Telecel Cash, AT Money, or Debit/Credit Card.
          </DialogDescription>
        </DialogHeader>

        {completed ? (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-foreground">Payment Successful!</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Thank you, <span className="font-semibold text-foreground">{customerName}</span>. Your payment of{" "}
              <span className="font-bold text-foreground">{formatGHS(amount)}</span> has been confirmed.
            </p>
            {lastReference && (
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-[11px] font-mono text-muted-foreground">
                Ref: {lastReference}
              </div>
            )}
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
                <Label className="text-xs">Phone Number</Label>
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
              <Label className="text-xs">Preferred Payment Method</Label>
              <Select value={channel} onValueChange={(val) => setChannel(val as PaymentChannel)}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile_money">Mobile Money (MTN, Telecel, AT)</SelectItem>
                  <SelectItem value="card">Visa / Mastercard / Apple Pay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3 text-muted-foreground" /> Total Payable
              </span>
              <span className="font-extrabold text-foreground text-sm">{formatGHS(amount)}</span>
            </div>

            <Button
              type="submit"
              disabled={isProcessing || createPaymentMutation.isPending}
              className="w-full text-xs font-semibold rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700"
            >
              {isProcessing || createPaymentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : channel === "card" ? (
                <CreditCard className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
              Pay {formatGHS(amount)} with Paystack
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
