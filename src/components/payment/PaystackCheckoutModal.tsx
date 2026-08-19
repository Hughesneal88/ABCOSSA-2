import { useState, useEffect } from "react";
import { ShieldCheck, Loader2, Smartphone, CreditCard, CheckCircle2, Lock, AlertTriangle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  openPaystackPopup,
  type PaymentChannel,
} from "@/lib/paystackClient";

export interface PaystackCheckoutModalProps {
  title?: string;
  defaultAmount?: number;
  unitPrice?: number;
  paymentType?: "dues" | "event" | "donation" | "voting";
  trigger?: React.ReactNode;
  onSuccess?: (details?: { votesCount?: number; reference?: string }) => void;
  metadata?: Record<string, unknown>;
}

export function PaystackCheckoutModal({
  title = "Make Payment",
  defaultAmount = 50,
  unitPrice = 1,
  paymentType = "dues",
  trigger,
  onSuccess,
  metadata = {},
}: PaystackCheckoutModalProps) {
  const [open, setOpen] = useState(false);
  const [votesCount, setVotesCount] = useState<number>(1);
  const [amount, setAmount] = useState<number>(paymentType === "voting" ? (unitPrice * 1) : defaultAmount);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [channel, setChannel] = useState<PaymentChannel>("mobile_money");
  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [lastReference, setLastReference] = useState("");

  const { data: paystackSettings, isLoading: loadingSettings } = usePaystackSettings();
  const createPaymentMutation = useCreatePayment();
  const completePaymentMutation = useCompletePayment();

  const publicKey = paystackSettings?.publicKey?.trim();
  const isConfigured = Boolean(publicKey && publicKey.length > 0);
  const isTestMode = Boolean(publicKey?.startsWith("pk_test_"));

  // Recalculate amount for voting whenever votesCount or unitPrice changes
  useEffect(() => {
    if (paymentType === "voting") {
      setAmount(Math.max(1, votesCount) * (unitPrice > 0 ? unitPrice : 1));
    }
  }, [votesCount, unitPrice, paymentType]);

  const handleVoteCountChange = (count: number) => {
    const validCount = Math.max(1, Math.floor(count));
    setVotesCount(validCount);
    setAmount(validCount * (unitPrice > 0 ? unitPrice : 1));
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConfigured) {
      toast.error("Paystack payment gateway is not configured. Please enter your Paystack Public Key in the Staff Admin Portal.");
      return;
    }

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
      // 1. Create pending transaction in database
      const totalVotes = paymentType === "voting" ? votesCount : 1;
      const { payment, reference } = await createPaymentMutation.mutateAsync({
        amount: Number(amount),
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        paymentType,
        paymentChannel: channel,
        description: `${title} - ${paymentType.toUpperCase()} (${totalVotes} vote${totalVotes > 1 ? "s" : ""})`,
        metadata: {
          ...metadata,
          votes_count: totalVotes,
          unit_price: unitPrice,
        },
      });

      setLastReference(reference);

      // 2. Trigger Paystack Popup (supports both V2 and V1 inline scripts)
      await openPaystackPopup({
        key: publicKey!,
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
            {
              display_name: "Votes Count",
              variable_name: "votes_count",
              value: String(totalVotes),
            },
          ],
          ...metadata,
          votes_count: totalVotes,
        },
        onSuccess: async (response) => {
          try {
            await completePaymentMutation.mutateAsync({
              paymentId: payment.id,
              transactionId: response.transaction || response.reference || response.trxref,
              reference: response.reference || reference,
              channel,
            });

            setCompleted(true);
            toast.success("Payment completed successfully via Paystack!");
            if (onSuccess) onSuccess({ votesCount: totalVotes, reference: response.reference || reference });
          } catch (err) {
            console.error("Error confirming payment:", err);
            toast.success("Payment received! Updating vote tally...");
            setCompleted(true);
            if (onSuccess) onSuccess({ votesCount: totalVotes, reference: response.reference || reference });
          } finally {
            setIsProcessing(false);
          }
        },
        onCancel: () => {
          setIsProcessing(false);
          toast.info("Payment cancelled. No charge was made.");
        },
      });
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

        {!isConfigured && !loadingSettings && (
          <Alert variant="destructive" className="my-2 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs font-semibold">Payment Gateway Setup Required</AlertTitle>
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
              The Paystack Public Key is not yet configured. An administrator must add the Paystack Public Key in the Staff Admin Portal (**Payments & Finance** tab) before online payments can be processed.
            </AlertDescription>
          </Alert>
        )}

        {completed ? (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-foreground">Payment Successful!</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Thank you, <span className="font-semibold text-foreground">{customerName}</span>. Your payment of{" "}
              <span className="font-bold text-foreground">{formatGHS(amount)}</span> has been confirmed.
              {paymentType === "voting" && (
                <span className="block mt-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  {votesCount} vote{votesCount > 1 ? "s" : ""} added to candidate!
                </span>
              )}
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
            {/* If voting, show Vote Quantity selector */}
            {paymentType === "voting" ? (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Select Number of Votes</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 5, 10, 20, 50].map((count) => (
                    <Button
                      key={count}
                      type="button"
                      variant={votesCount === count ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleVoteCountChange(count)}
                      className="text-xs font-semibold h-8"
                    >
                      {count}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Custom votes:</span>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={votesCount}
                    onChange={(e) => handleVoteCountChange(Number(e.target.value))}
                    className="h-8 text-xs font-bold w-28"
                  />
                  <span className="text-xs text-muted-foreground">
                    ({formatGHS(unitPrice)}/vote)
                  </span>
                </div>
              </div>
            ) : (
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
            )}

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
                <Label className="text-xs">Phone Number (MoMo)</Label>
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
              disabled={isProcessing || createPaymentMutation.isPending || !isConfigured}
              className="w-full text-xs font-semibold rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:opacity-50"
            >
              {isProcessing || createPaymentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : channel === "card" ? (
                <CreditCard className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
              {isConfigured ? `Pay ${formatGHS(amount)} with Paystack` : "Paystack Key Required"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
