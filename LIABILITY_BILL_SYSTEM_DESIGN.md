# Liability Bill System - Complete Design

## Overview

Liability payments are managed through **Bills**. Each payment is a bill that can be automatically generated or manually created. Bills are the primary entity for tracking and paying liabilities.

## 1. Bill Structure for Liability Payments

### Bill Fields
- **Amount**: Total payment amount
- **Interest Amount**: Separate interest component (can be included in total or shown separately)
- **Principal Amount**: Principal component (calculated or manual)
- **Date**: Due date
- **Account**: Account to pay from (optional, can be set later)
- **Description**: Payment description
- **Status**: pending, paid, overdue, cancelled, skipped
- **Liability ID**: Link to parent liability

### Interest Handling
- **Option 1: Interest Included in Total**
  - Total Amount = Principal + Interest
  - Interest Amount shown separately for breakdown
  - User pays: Total Amount
  
- **Option 2: Interest Separate**
  - Total Amount = Principal only
  - Interest Amount tracked separately
  - User pays: Principal + Interest (separate transactions)

## 2. Liability Creation Flow

### Step 1: Basic Information
- Name
- Type (Loan, Credit Card, EMI, etc.)
- Total Amount Owed
- Interest Rate
- Start Date
- End Date (targeted payoff date)
- Frequency (monthly, weekly, etc.)

### Step 2: Bill Generation Options

**Option A: Automatic Generation**
- System generates all bills based on:
  - Frequency (monthly, weekly, etc.)
  - Start date
  - End date
  - Interest rate
  - Payment amount (calculated or manual)
- All bills created immediately
- User can edit any bill later

**Option B: Manual Creation**
- User creates bills one by one
- User schedules them manually
- System tracks remaining balance
- User completes liability by paying all bills

**Option C: Hybrid**
- System generates initial bills
- User can add/remove/edit bills
- System recalculates based on changes

## 3. Automatic Bill Generation Engine

### Input Parameters
- **Liability ID**: Parent liability
- **Start Date**: First payment date
- **End Date**: Last payment date
- **Frequency**: monthly, weekly, bi-weekly, etc.
- **Payment Amount**: Fixed or calculated
- **Interest Rate**: Annual percentage rate
- **Total Amount**: Original loan amount
- **Interest Calculation Method**: reducing balance, fixed, etc.

### Generation Logic

```typescript
function generateLiabilityBills(
  liabilityId: string,
  startDate: Date,
  endDate: Date,
  frequency: 'monthly' | 'weekly' | 'bi-weekly' | 'custom',
  paymentAmount: number,
  interestRate: number,
  totalAmount: number,
  interestIncluded: boolean
) {
  const bills = [];
  let currentDate = new Date(startDate);
  let remainingBalance = totalAmount;
  let paymentNumber = 1;
  
  while (currentDate <= endDate && remainingBalance > 0) {
    // Calculate interest for this period
    const interestAmount = calculateInterest(
      remainingBalance,
      interestRate,
      frequency
    );
    
    // Calculate principal
    const principalAmount = interestIncluded
      ? paymentAmount - interestAmount
      : paymentAmount;
    
    // Create bill
    const bill = {
      liability_id: liabilityId,
      due_date: currentDate,
      amount: interestIncluded ? paymentAmount : principalAmount,
      interest_amount: interestAmount,
      principal_amount: principalAmount,
      payment_number: paymentNumber,
      status: 'pending',
      metadata: {
        principal_component: principalAmount,
        interest_component: interestAmount,
        remaining_balance: remainingBalance - principalAmount,
      }
    };
    
    bills.push(bill);
    
    // Update for next payment
    remainingBalance -= principalAmount;
    currentDate = addFrequency(currentDate, frequency);
    paymentNumber++;
    
    // Adjust last payment if needed
    if (remainingBalance < principalAmount) {
      bill.amount = remainingBalance + interestAmount;
      bill.principal_amount = remainingBalance;
      remainingBalance = 0;
    }
  }
  
  return bills;
}
```

## 4. Bill Payment Flow

### Payment Modal
1. **Select Bill**: User selects a bill to pay
2. **Payment Details**:
   - Amount (defaults to bill amount, can be adjusted)
   - Interest Amount (if separate)
   - Payment Date
   - Account (to pay from)
   - Fund Source (Personal, Liability Fund)
   - Description
3. **Preview Impact**:
   - Shows what happens when transaction pays:
     - Account balance change
     - Fund balance change
     - Liability balance reduction
     - Remaining balance
     - Next payment due
4. **Confirm Payment**:
   - Creates transaction
   - Updates bill status to 'paid'
   - Updates liability balance
   - Records payment in bill_payments table
   - Updates account/fund balances

## 5. Bill Editing

### Editable Fields
- **Amount**: Can change payment amount
  - One-time change
  - Update all future bills
  - Add difference to next bill
- **Date**: Can change due date
  - Must be between start-date and end-date
  - Validates against liability constraints
- **Interest Amount**: Can adjust interest
  - Recalculates principal
  - Updates total amount
- **Account**: Can change payment account
- **Description**: Can update description
- **Status**: Can mark as paid, skipped, cancelled

### Date Validation
- Bill date must be >= liability start_date
- Bill date must be <= liability end_date
- System validates on edit
- Shows error if invalid

## 6. Automatic Amount Adjustment

### Interest Rate Impact
- **Visual Adjustment**: System shows how interest affects total
- **Automatic Calculation**: System recalculates bills when interest rate changes
- **Sub-conscious Updates**: Bills can auto-adjust based on:
  - Interest rate changes
  - Balance changes
  - Payment adjustments

### Adjustment Scenarios
1. **Interest Rate Change**:
   - User updates interest rate
   - System recalculates all pending bills
   - Shows impact: new amounts, new total interest
   - User confirms or rejects changes

2. **Balance Change**:
   - User makes extra payment
   - System recalculates remaining bills
   - Adjusts amounts to maintain end date
   - Or adjusts end date to maintain amounts

3. **Payment Adjustment**:
   - User changes one bill amount
   - System asks: how to apply change?
   - Updates remaining bills accordingly

## 7. Calendar Integration

### Bills on Calendar
- Bills appear on transactions calendar
- Each bill shows:
  - Bill title
  - Amount
  - Due date
  - Status (color-coded)
- Tapping bill opens bill detail
- Can pay directly from calendar

### Visual Indicators
- **Pending**: Orange dot
- **Due Today**: Red dot
- **Overdue**: Dark red dot
- **Paid**: Green dot
- **Skipped**: Gray dot

## 8. Database Schema

### Bills Table (Enhanced for Liabilities)
```sql
ALTER TABLE bills ADD COLUMN IF NOT EXISTS liability_id UUID REFERENCES liabilities(id);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS interest_amount DECIMAL(12,2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS principal_amount DECIMAL(12,2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_number INTEGER;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS interest_included BOOLEAN DEFAULT true;
```

### Bill Payments Table (Existing)
- Links to bills
- Records actual payments
- Tracks transaction_id
- Records account_id
- Tracks payment status

## 9. UI/UX Flow

### Liability Detail Screen
1. **Hero Section**: Current balance
2. **Next Payment Card**: 
   - Shows next bill
   - Amount breakdown (principal + interest)
   - Due date
   - [Pay Now] button
3. **Bills List**:
   - Shows all bills (paid and pending)
   - Each bill is editable
   - Tap to edit: amount, date, account, etc.
   - Swipe actions: pay, skip, postpone
4. **Payment History**:
   - Shows paid bills
   - Shows payment details
   - Shows fund source used

### Bill Detail Screen
1. **Bill Info**:
   - Amount
   - Interest Amount
   - Principal Amount
   - Due Date
   - Account
   - Description
2. **Payment Actions**:
   - [Pay Bill] button
   - [Edit Bill] button
   - [Skip Bill] button
   - [Postpone] button
3. **Payment Impact Preview**:
   - Shows what happens when paid
   - Account balance change
   - Fund balance change
   - Liability balance reduction

### Create Bill Modal (for Liabilities)
1. **Bill Details**:
   - Amount
   - Interest Amount (optional, can be included)
   - Due Date
   - Account (optional)
   - Description
2. **Interest Options**:
   - Include in total
   - Show separately
3. **Validation**:
   - Date must be between start and end date
   - Amount must be positive
   - Interest must be valid

## 10. Implementation Steps

### Phase 1: Database Schema
1. Add liability_id to bills table
2. Add interest_amount, principal_amount to bills
3. Add payment_number to bills
4. Add interest_included flag
5. Create indexes for performance

### Phase 2: Bill Generation
1. Create bill generation engine
2. Integrate with liability creation
3. Support automatic and manual generation
4. Handle interest calculations
5. Validate dates and amounts

### Phase 3: Bill Payment
1. Update payment modal for bills
2. Add fund selection
3. Add impact preview
4. Link to transactions
5. Update liability balance

### Phase 4: Bill Editing
1. Create edit bill modal
2. Support amount changes
3. Support date changes
4. Validate constraints
5. Update related bills

### Phase 5: Calendar Integration
1. Show bills on calendar
2. Add bill indicators
3. Support bill actions from calendar
4. Filter bills by status
5. Show bill details on tap

### Phase 6: Auto-Adjustment
1. Implement interest rate change handling
2. Implement balance change handling
3. Implement payment adjustment handling
4. Add impact analysis
5. Add user confirmation

## 11. Key Functions

### Bill Generation
```typescript
function generateLiabilityBills(liability: Liability): Bill[]
function createLiabilityBill(billData: CreateBillData): Bill
function updateLiabilityBill(billId: string, updates: UpdateBillData): Bill
function deleteLiabilityBill(billId: string): void
```

### Bill Payment
```typescript
function payLiabilityBill(billId: string, paymentData: PaymentData): Transaction
function calculatePaymentImpact(billId: string, paymentAmount: number): ImpactAnalysis
function validateBillDate(billDate: Date, liability: Liability): ValidationResult
```

### Bill Adjustment
```typescript
function adjustBillAmount(billId: string, newAmount: number, option: AdjustmentOption): Bill[]
function adjustBillDate(billId: string, newDate: Date): Bill
function recalculateBills(liabilityId: string): Bill[]
function applyInterestRateChange(liabilityId: string, newRate: number): Bill[]
```

## 12. User Experience

### Clarity
- Always show breakdown: principal + interest = total
- Show impact before confirming payment
- Show remaining balance after payment
- Show next payment due

### Flexibility
- Allow manual bill creation
- Allow automatic generation
- Allow editing any bill
- Allow skipping bills
- Allow postponing bills

### Safety
- Validate all dates (between start and end)
- Validate all amounts (positive, within limits)
- Show warnings for significant changes
- Require confirmation for major adjustments
- Maintain audit trail

### Transparency
- Show exactly what will happen
- Display calculations
- Show payment history
- Show remaining balance
- Show interest paid so far

