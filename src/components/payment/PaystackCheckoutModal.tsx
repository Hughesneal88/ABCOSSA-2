import { useState, useEffect } from "react";
import type { BulkVotingPackage } from "@/hooks/useBulkVoting";
import {
  ShieldCheck,
  Loader2,
  Smartphone,
  CreditCard,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Heart,
  Clock,
  XCircle,
  RefreshCw,
} from "lucide-react";
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
  useVerifyPaystackPayment,
  usePaystackSettings,
} from "@/hooks/usePayments";
import {
  formatGHS,
  openPaystackPopup,
  type PaymentChannel,
  type VerificationResult,
} from "@/lib/paystackClient";

export interface PaystackCheckoutModalProps {
  title?: string;
  defaultAmount?: number;
  unitPrice?: number;
  paymentType?: "dues" | "event" | "donation" | "voting";
  trigger?: React.ReactNode;
  onSuccess?: (details?: { votesCount?: number; reference?: string; verified?: boolean }) => void;
  metadata?: Record<string, unknown>;
  bulkPackages?: BulkVotingPackage[];
  isBulkActive?: boolean;
}

export function PaystackCheckoutModal({
  title = "Make Payment",
  defaultAmount = 50,
  unitPrice = 1,
  paymentType = "dues",
  trigger,
  onSuccess,
  metadata = {},
  bulkPackages = [],
  isBulkActive = false,
}: PaystackCheckoutModalProps) {
  const [open, setOpen] = useState(false);
  const [votesCount, setVotesCount] = useState<number>(25);
  const [amount, setAmount] = useState<number>(paymentType === "voting" ? unitPrice * 25 : defaultAmount || 25);
  const [selectedBulkPackage, setSelectedBulkPackage] = useState<BulkVotingPackage | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [channel, setChannel] = useState<PaymentChannel>("mobile_money");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [completed, setCompleted] = useState(false);
  const [lastReference, setLastReference] = useState("");
  const [createdPaymentId, setCreatedPaymentId] = useState<string>("");

  const { data: paystackSettings, isLoading: loadingSettings } = usePaystackSettings();
  const createPaymentMutation = useCreatePayment();
  const verifyPaymentMutation = useVerifyPaystackPayment();

  const envPublicKey = ((import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string) || "").trim();
  const publicKey = (paystackSettings?.publicKey?.trim() || envPublicKey).replace(/^["'`]|["'`]$/g, "");
  const isConfigured = Boolean(publicKey && publicKey.length > 0);
  const isTestMode = Boolean(publicKey?.startsWith("pk_test_"));

  // Recalculate amount for voting whenever votesCount or unitPrice changes
  useEffect(() => {
    if (paymentType === "voting") {
      if (selectedBulkPackage) {
        // Bulk package: fixed amount and votes
        setAmount(selectedBulkPackage.amount_ghs);
        setVotesCount(selectedBulkPackage.votes);
      } else if (isBulkActive && bulkPackages.length > 0) {
        // Bulk active but no package selected yet: default to first package
        // Don't change — let user pick
      } else {
        setAmount(Math.max(1, votesCount) * (unitPrice > 0 ? unitPrice : 1));
      }
    }
  }, [votesCount, unitPrice, paymentType, selectedBulkPackage, isBulkActive, bulkPackages.length]);

  const handleVoteCountChange = (count: number) => {
    const validCount = Math.max(1, Math.floor(count));
    setVotesCount(validCount);
    setSelectedBulkPackage(null); // clear bulk selection when custom count
    setAmount(validCount * (unitPrice > 0 ? unitPrice : 1));
  };

  const handleBulkPackageSelect = (pkg: BulkVotingPackage) => {
    setSelectedBulkPackage(pkg);
    setVotesCount(pkg.votes);
    setAmount(pkg.amount_ghs);
  };

  const handleVerifyReference = async (ref: string, pId?: string, isManualCheck = false) => {
    setIsVerifying(true);
    try {
      const res = await verifyPaymentMutation.mutateAsync(ref);
      setVerificationResult(res);
      setCompleted(true);

      if (res.status === "paid") {
        toast.success(
          paymentType === "voting"
            ? `Payment verified! ${res.votesCount || votesCount} vote(s) successfully counted.`
            : "Payment verified successfully via Paystack!"
        );
        if (onSuccess) {
          onSuccess({
            votesCount: res.votesCount || (paymentType === "voting" ? votesCount : 1),
            reference: ref,
            verified: true,
          });
        }
      } else if (res.status === "pending") {
        if (isManualCheck) {
          toast.info("Payment is still awaiting authorization on your phone. Please confirm the prompt.");
        }
      } else if (res.status === "failed" || res.status === "cancelled") {
        toast.error("Payment was not completed or failed on Paystack. No votes were recorded.");
      }
    } catch (err) {
      console.error("Verification failed:", err);
      toast.error(err instanceof Error ? err.message : "Verification request failed");
    } finally {
      setIsVerifying(false);
    }
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
    setVerificationResult(null);

    try {
      // 1. Create PENDING transaction in database (votes remain pending)
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
          ...(selectedBulkPackage
            ? {
                bulk_package: true,
                bulk_amount: selectedBulkPackage.amount_ghs,
                bulk_votes: selectedBulkPackage.votes,
                bulk_label: selectedBulkPackage.label,
              }
            : {}),
        },
      });

      setLastReference(reference);
      setCreatedPaymentId(payment.id);

      // Close the modal temporarily so Paystack popup is interactive without Radix focus trap
      setOpen(false);

      // 2. Trigger Paystack Inline Popup
      await openPaystackPopup({
        key: publicKey!,
        email: customerEmail.trim(),
        amount: Math.round(Number(amount) * 100), // Pesewas
        currency: paystackSettings?.currency || "GHS",
        ref: reference,
        firstname: customerName.trim().split(" ")[0] || customerName.trim(),
        lastname: customerName.trim().split(" ").slice(1).join(" ") || undefined,
        phone: customerPhone.trim(),
        // Restrict the checkout to exactly the channel the user selected so the
        // Mobile Money screen (phone number -> USSD prompt) is reached directly.
        channels: channel === "card" ? ["card"] : ["mobile_money"],
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
          setIsProcessing(false);
          setOpen(true);
          const activeRef = response.reference || reference;
          await handleVerifyReference(activeRef, payment.id, false);
        },
        onCancel: async () => {
          setIsProcessing(false);
          setOpen(true);
          // Check if payment was authorized even if user closed the window
          await handleVerifyReference(reference, payment.id, false);
        },
      });
    } catch (err) {
      console.error("Payment initialization error:", err);
      setIsProcessing(false);
      const errMsg = err instanceof Error ? err.message : "Payment initialization failed";
      toast.error(errMsg);
    }
  };

  const handleReset = () => {
    setCompleted(false);
    setVerificationResult(null);
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

        {/* State 1: Verifying with Paystack */}
        {isVerifying ? (
          <div className="text-center py-8 space-y-4">
            <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <ShieldCheck className="w-6 h-6 text-primary absolute" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Verifying with Paystack...</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                Please wait while we verify your transaction status with Paystack. Votes are held pending until verified.
              </p>
            </div>
            {lastReference && (
              <div className="p-2 rounded-lg bg-muted/40 border border-border/40 text-[11px] font-mono text-muted-foreground inline-block">
                Ref: {lastReference}
              </div>
            )}
          </div>
        ) : completed && verificationResult ? (
          /* State 2: Verification Result (Paid, Pending, or Failed) */
          <div className="text-center py-6 space-y-4">
            {verificationResult.status === "paid" ? (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Payment Verified!</h3>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                    Thank you, <span className="font-semibold text-foreground">{customerName}</span>. Your payment of{" "}
                    <span className="font-bold text-foreground">{formatGHS(amount)}</span> has been confirmed by Paystack.
                  </p>
                  {paymentType === "voting" && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold text-xs inline-flex items-center gap-2">
                      <Heart className="w-4 h-4 fill-emerald-500 text-emerald-500" />
                      <span>
                        {verificationResult.votesCount || votesCount} vote(s) successfully counted!
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : verificationResult.status === "pending" ? (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                  <Clock className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Payment Pending Authorization</h3>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                    Your vote request has been created, but Paystack is still confirming your mobile money authorization.
                  </p>
                  <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs">
                    <span className="font-semibold block">Votes are kept as pending:</span>
                    Your {votesCount} vote(s) will be automatically credited once payment confirmation is received from Paystack.
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isVerifying}
                    onClick={() => handleVerifyReference(lastReference, createdPaymentId, true)}
                    className="text-xs font-semibold gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Re-check Status
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
                  <XCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Payment Unsuccessful</h3>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                    Paystack reported that the payment was cancelled or could not be verified. No votes were recorded.
                  </p>
                </div>
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCompleted(false);
                      setVerificationResult(null);
                    }}
                    className="text-xs font-semibold"
                  >
                    Try Again
                  </Button>
                </div>
              </>
            )}

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
              <div className="space-y-3">
                {isBulkActive && bulkPackages.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className="text-[10px] bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">
                        Bulk Pricing Active
                      </Badge>
                      <Label className="text-xs font-semibold">Select a Vote Package</Label>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {[...bulkPackages]
                        .sort((a, b) => a.amount_ghs - b.amount_ghs)
                        .map((pkg, idx) => (
                          <Button
                            key={idx}
                            type="button"
                            variant={selectedBulkPackage === pkg ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleBulkPackageSelect(pkg)}
                            className="h-auto py-3 justify-between text-left gap-3"
                          >
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-bold">{pkg.label || `${formatGHS(pkg.amount_ghs)} = ${pkg.votes} votes`}</span>
                              <span className="text-[10px] text-muted-foreground font-normal">
                                {pkg.votes > 0 ? formatGHS(pkg.amount_ghs / pkg.votes) : ""}/vote
                              </span>
                            </div>
                            {selectedBulkPackage === pkg && (
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            )}
                          </Button>
                        ))}
                    </div>
                    <div className="pt-1">
                      <Label className="text-[10px] text-muted-foreground">Or enter custom amount:</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          min={1}
                          max={5000}
                          value={votesCount}
                          onChange={(e) => handleVoteCountChange(Number(e.target.value))}
                          className="h-8 text-xs font-bold w-28"
                          placeholder="Votes"
                        />
                        <span className="text-xs text-muted-foreground">
                          votes at {formatGHS(unitPrice)}/vote = {formatGHS(votesCount * unitPrice)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Label className="text-xs font-semibold">Select Number of Votes</Label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[25, 50, 100, 250, 500].map((count) => (
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
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Select Amount (GHS)</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[25, 50, 100, 250, 500].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={amount === preset ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAmount(preset)}
                      className="text-xs font-semibold h-8"
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Custom Amount (GHS)</Label>
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
