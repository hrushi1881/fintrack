# Loan Liability System - Complete Design

## 1. Loan Creation Flow

### Step 1: Basic Information
- **Question 1**: What should we call this?
- **Question 2**: What type of liability? (Loan, Credit Card, EMI, Line of Credit, Other)
- **Question 3**: How much do you owe in total?
- **Question 4**: What's your monthly payment?
- **Question 5**: When is your first payment due?

### Step 2: Did You Receive Funds?
- **Yes**: User received money when taking the loan
  - Enter amount received
  - Select account where money was deposited
  - System creates "Liability Fund" in that account
  - Funds are tracked separately from personal funds
  
- **No**: User didn't receive money (credit card, existing debt)
  - Just track payments
  - No fund allocation needed

### Step 3: Automatic Bill Generation
- System generates all payment schedules (bills)
- Each bill includes:
  - Due date
  - Amount (principal + interest breakdown)
  - Status (pending, paid, overdue, cancelled)

---

## 2. Fund Withdrawal System

### Scenario: User Wants to Use Loan Funds

**Example**: Kavya took a ₹5,00,000 car loan. Bank transferred ₹5,00,000 to her Savings Account as "Liability Fund (Car Loan)".

**Step 1: Withdraw Funds**
- User goes to "Car Loan" → "Use Funds"
- Enters withdrawal amount: ₹4,80,000
- Selects destination account: "Savings Account" (same or different account)
- Money stays in destination account as "Liability Fund (Car Loan)"
- Only that specific liability fund is deducted
- Personal funds remain untouched

**Step 2: Record Expense** (Optional)
- User can optionally create an expense transaction
- Category: Vehicle Purchase
- From: Savings Account → Liability Fund (Car Loan)
- This tracks what the loan money was used for

**Fund Tracking**:
- Original loan: ₹5,00,000
- Withdrawn: ₹4,80,000
- Remaining in Liability Fund: ₹20,000
- Total loan amount owed: ₹5,00,000 (unchanged)

---

## 3. Fund Conversion (Liability → Personal)

### Transfer Modal Flow

**User wants to convert liability funds to personal funds**

**Step 1: Select Account**
- User selects account containing liability fund
- System shows all funds in that account

**Step 2: Select Fund Type**
- User selects "Liability Fund"
- System shows all liability funds in that account
- User selects specific liability fund (e.g., "Car Loan")

**Step 3: Select Destination**
- User selects "Personal Fund" of the same account
- Conversion happens within the same account
- Liability fund decreases
- Personal fund increases
- Total account balance remains unchanged

**Example**:
- Savings Account Total: ₹1,00,000
  - Personal Fund: ₹20,000
  - Liability Fund (Car Loan): ₹80,000
  
- After converting ₹30,000:
  - Personal Fund: ₹50,000 (+₹30,000)
  - Liability Fund (Car Loan): ₹50,000 (-₹30,000)
  - Total: ₹1,00,000 (unchanged)

---

## 4. Payment Adjustment System

### Real-Life Scenarios to Handle

#### Scenario 1: Change Payment Amount
**User wants to pay more or less than scheduled**

**Options**:
1. **One-time change**: Only this payment changes
   - Next payment returns to original amount
   - Impact: Adjusts balance, may affect schedule
   
2. **Update all future payments**: All remaining payments change
   - Recalculates entire schedule
   - Impact: Changes loan term or balance calculation

3. **Add to next payment**: Extra amount added to next bill
   - Current payment: ₹10,000
   - User pays: ₹15,000
   - Next payment: ₹15,000 (original ₹10,000 + ₹5,000 extra)

#### Scenario 2: Change Payment Date
**User wants to postpone or move up a payment**

**Options**:
1. **Postpone to specific date**: Move payment to later date
   - Validates: Not in past, not after loan end date
   - Impact: May affect next payment date
   
2. **Move up**: Pay earlier than scheduled
   - Impact: Reduces interest, may affect next payment

#### Scenario 3: Change Total Amount Owed
**Loan amount increases or decreases**

**Increase** (e.g., additional loan disbursement):
- User enters new total amount
- System asks: "How should we adjust?"
  - Option A: Keep same monthly payment → Extend loan term
  - Option B: Keep same end date → Increase monthly payment
  - Option C: Custom payment and term

**Decrease** (e.g., partial settlement):
- User enters new total amount
- System validates: Cannot be less than current balance
- If valid, recalculates schedule

#### Scenario 4: Change Interest Rate
**Floating rate loan rate changes**

**Increase**:
- User updates interest rate
- System asks: "How should we adjust?"
  - Option A: Keep same payment → Extend loan term
  - Option B: Keep same term → Increase monthly payment
  - Shows impact: Additional interest cost

**Decrease**:
- User updates interest rate
- System asks: "How should we adjust?"
  - Option A: Keep same payment → Reduce loan term (finish earlier)
  - Option B: Keep same term → Reduce monthly payment
  - Shows impact: Interest saved

#### Scenario 5: Skip Payment
**User can't pay this month**

**Options**:
1. **Add to next payment**: Next bill includes skipped amount
2. **Add to end of loan**: Extra payment at the end
3. **Spread across remaining**: Divide amount across all future payments

#### Scenario 6: Extra Payment
**User pays more than required**

**Options**:
1. **Reduce monthly payment**: Keep same end date, lower payment
2. **Reduce loan term**: Keep same payment, finish earlier
3. **Skip next few payments**: Pre-pay for upcoming months
4. **Just reduce principal**: Everything stays same, owe less

---

## 5. Payment Modal Flow

### Regular Payment
1. User selects liability
2. System shows next due payment
3. User selects account
4. User selects fund source:
   - Personal Fund (from any account)
   - Liability Fund (from same liability, if exists)
5. User enters payment amount (defaults to scheduled amount)
6. System shows breakdown:
   - Principal component
   - Interest component
   - Remaining balance
7. If amount > scheduled amount:
   - System detects extra payment
   - Shows options: reduce payment, reduce term, skip payments, reduce principal
8. User confirms payment

### Payment Adjustments Available Per Schedule
1. **Edit Amount**: Change this payment's amount
   - One-time change
   - Update all future payments
   - Add difference to next payment
   
2. **Edit Date**: Change due date
   - Postpone to specific date
   - Move up (pay earlier)
   
3. **Skip Payment**: Skip this payment
   - Add to next
   - Add to end
   - Spread across remaining
   
4. **Mark Paid**: Record payment
   - Uses pay liability modal
   - Updates balance
   - Marks schedule as paid

---

## 6. Database Structure

### Liability Funds Storage
- `account_liability_portions` table tracks liability funds in accounts
- Each liability can have funds in multiple accounts
- Funds are segregated from personal funds
- Only liability-specific funds are used for payments

### Payment Schedules
- `liability_schedules` table stores all payment bills
- Each schedule has:
  - `due_date`: When payment is due
  - `amount`: Total payment amount
  - `metadata`: Principal/interest breakdown
  - `status`: pending, paid, overdue, cancelled
  - `account_id`: Optional linked account

### Payment Adjustments
- `liability_adjustments` table tracks all adjustments
- Records:
  - Adjustment type (amount_change, date_change, rate_change, etc.)
  - Old value
  - New value
  - Impact analysis
  - Timestamp

---

## 7. UI/UX Flow

### Liability Detail Screen
1. **Hero Section**: Current balance
2. **Next Payment Card**: 
   - Due date
   - Amount (principal + interest)
   - [Pay Now] button
   - [Reschedule] button
   - [Skip] button
   
3. **Upcoming Payments List**:
   - Shows next 5-10 payments
   - Each payment is tappable
   - Tap to edit: amount, date, skip
   - Long press: More options
   
4. **Payment History**:
   - Past payments
   - Shows fund source used
   - Principal/interest breakdown
   
5. **Fund Management**:
   - Shows liability funds in accounts
   - [Use Funds] button
   - [Convert to Personal] button (opens transfer modal)

### Edit Payment Schedule Modal
1. **Payment Info**: Shows current due date and amount
2. **Edit Amount**:
   - Input field for new amount
   - Radio buttons:
     - One-time change
     - Update all future payments
     - Add difference to next payment
   
3. **Edit Date**:
   - Date picker
   - Validates: Not in past, not after loan end
   
4. **Actions**:
   - [Save Changes] button
   - [Skip Payment] button
   - [Cancel] button

---

## 8. Implementation Priority

### Phase 1: Core Functionality
1. ✅ Loan creation with fund allocation
2. ✅ Automatic bill generation
3. ✅ Payment modal with fund selection
4. ✅ Basic payment adjustments (skip, postpone)

### Phase 2: Fund Management
1. ✅ Fund withdrawal modal
2. ✅ Transfer modal for liability → personal conversion
3. ⏳ Fund tracking in accounts
4. ⏳ Fund usage history

### Phase 3: Advanced Adjustments
1. ⏳ Edit payment amount (one-time, all future, add to next)
2. ⏳ Edit payment date
3. ⏳ Change total amount owed
4. ⏳ Change interest rate
5. ⏳ Impact analysis for all adjustments

### Phase 4: Enhanced Features
1. ⏳ Payment reminders
2. ⏳ Overdue handling
3. ⏳ Late fee calculation
4. ⏳ Amortization schedule view
5. ⏳ Interest saved calculations

---

## 9. Key Functions Needed

### Fund Management
- `drawLiabilityFunds(liabilityId, amount, accountId, destinationAccountId)`: Withdraw funds from liability
- `convertLiabilityToPersonal(accountId, liabilityId, amount)`: Convert liability fund to personal fund
- `getLiabilityFunds(liabilityId)`: Get all accounts holding liability funds

### Payment Adjustments
- `adjustPaymentAmount(scheduleId, newAmount, option)`: Change payment amount
- `adjustPaymentDate(scheduleId, newDate)`: Change payment date
- `adjustTotalAmount(liabilityId, newAmount, option)`: Change total loan amount
- `adjustInterestRate(liabilityId, newRate, option)`: Change interest rate
- `recalculateSchedules(liabilityId)`: Recalculate all schedules after adjustment

### Impact Analysis
- `calculateAdjustmentImpact(liabilityId, adjustmentType, newValue)`: Calculate impact of adjustment
- `showImpactPreview(impact)`: Display impact to user before confirming

---

## 10. User Experience Considerations

### Clarity
- Always show impact before confirming adjustments
- Use clear language: "Your monthly payment will increase by ₹2,000"
- Show visual comparisons: Before vs After

### Flexibility
- Allow partial changes (one payment) or full changes (all payments)
- Support multiple adjustment types simultaneously
- Don't lock users into rigid structures

### Safety
- Validate all inputs
- Prevent invalid states (e.g., negative balances, past dates)
- Show warnings for significant changes
- Require confirmation for major adjustments

### Transparency
- Show exactly what will change
- Display calculations (how new amounts are derived)
- Maintain audit trail of all adjustments
- Show payment history with adjustments noted

