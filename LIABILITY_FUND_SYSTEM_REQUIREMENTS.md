# Liability Fund System - Complete Requirements

## Overview
This document outlines the complete requirements for the liability fund system, including fund types, payment flow, bill generation, and fund conversion.

---

## 1. Fund Types in Accounts

### 1.1 Personal Fund (Mandatory)
- **Type**: `personal`
- **Description**: User's own money, available for spending
- **Availability**: Every account has one personal fund
- **Usage**: Can be used for any transaction (payments, transfers, expenses)

### 1.2 Liability Fund (Optional)
- **Type**: `liability` (stored as `borrowed` in account_funds)
- **Description**: Money reserved for liability payments
- **Availability**: Created when user receives money from a liability
- **Usage**: Can only be used to pay the specific liability it's linked to
- **Tracking**: Tracked separately from personal funds in `account_liability_portions` table

### 1.3 Goal Fund (Optional)
- **Type**: `goal`
- **Description**: Money saved toward specific goals
- **Availability**: Created when user contributes to a goal
- **Usage**: Cannot be spent directly (must withdraw to personal first)
- **Note**: Not relevant for liability payments

---

## 2. Creating a Liability

### 2.1 Basic Flow
1. User creates liability with 5 questions:
   - Name
   - Type (Loan, Credit Card, EMI, Line of Credit, Other)
   - Total amount
   - Monthly payment
   - First payment date
   - Optional: Did you receive money?

### 2.2 Did You Receive Money?
- **If Yes**: 
  - User enters received amount
  - User selects account where money went
  - System creates liability fund in that account
  - Money is tracked separately from personal funds
  - `account_liability_portions` record created
  - Account balance increases by received amount

- **If No**:
  - No fund created
  - Just tracks payment schedule
  - No money management needed

### 2.3 Automatic Bill Generation
- System automatically generates all payment bills
- Bills stored in `liability_schedules` table
- Each bill has:
  - Due date
  - Amount
  - Principal component (calculated)
  - Interest component (calculated)
  - Status (pending, completed, cancelled, overdue)
- Bills can be edited later by user
- Bills appear on calendar in transactions page

---

## 3. Paying a Liability

### 3.1 Payment Flow
1. User selects liability to pay
2. User selects account to pay from
3. User selects fund type:
   - **Personal Funds**: User's own money
   - **Liability Funds**: Money from the same liability (if available)
4. User enters payment amount
5. User selects payment date
6. User adds description (optional)
7. System shows payment breakdown:
   - Total amount
   - Principal portion
   - Interest portion
   - Remaining balance after payment

### 3.2 Fund Selection Rules
- **Personal Funds**: Can always be used
- **Liability Funds**: Can only be used if:
  - Liability fund exists in selected account
  - Liability fund is linked to the same liability being paid
  - Liability fund has sufficient balance
- **Goal Funds**: Cannot be used for liability payments

### 3.3 Payment Processing
- **From Personal Funds**: Uses `repay_liability` RPC
  - Deducts from account balance (personal fund)
  - Reduces liability balance
  - Creates transaction record
  - Updates liability payment history

- **From Liability Funds**: Uses `settle_liability_portion` RPC
  - Deducts from liability fund (not personal fund)
  - Reduces `account_liability_portions` amount
  - Reduces liability balance
  - Creates transaction record
  - Updates liability payment history

### 3.4 Payment Breakdown
- Shows principal vs interest for each payment
- Principal: Reduces the actual debt
- Interest: Cost of borrowing
- Breakdown calculated based on:
  - Current balance
  - Interest rate
  - Payment amount
  - Remaining term

---

## 4. Converting Liability Funds to Personal Funds

### 4.1 Transfer Flow
1. User opens transfer modal
2. User selects transfer type: "Liability to Personal"
3. User selects source account (where liability fund is)
4. User selects fund type: "Liability Funds"
5. User selects specific liability fund
6. User selects destination: Same account
7. User selects destination fund type: "Personal Funds"
8. User enters amount to convert
9. User adds notes (optional)
10. System converts liability fund to personal fund

### 4.2 Conversion Process
- Uses `convertLiabilityToPersonal` function
- Reduces `account_liability_portions` amount
- Increases personal fund balance
- Account total balance remains the same
- Creates transaction record (if needed)
- Updates account breakdown

### 4.3 Use Cases
- User wants to use liability money for personal expenses
- User over-allocated to liability fund
- User wants to free up money for other purposes
- User wants to reduce liability fund allocation

---

## 5. Bill Management

### 5.1 Automatic Bill Generation
- Bills generated when liability is created
- Based on:
  - Total amount
  - Monthly payment
  - Interest rate
  - Start date
  - End date (calculated)
- Each bill has:
  - Due date (monthly from start date)
  - Amount (monthly payment, adjusted for last payment)
  - Principal component (calculated)
  - Interest component (calculated)
  - Status (pending by default)

### 5.2 Bill Editing
- Users can edit bills after creation
- Editable fields:
  - Due date (must be between start and end date)
  - Amount (can be adjusted)
  - Status (pending, completed, cancelled, overdue)
- Restrictions:
  - Due date must be between liability start and end date
  - Amount must be positive
  - Cannot edit completed bills (or allow with confirmation)

### 5.3 Bill Status
- **Pending**: Scheduled, not yet paid
- **Completed**: Paid
- **Cancelled**: Cancelled by user
- **Overdue**: Past due date, not paid

### 5.4 Bill Calendar Integration
- Bills appear on calendar in transactions page
- Shows due date
- Shows amount
- Shows liability name
- Shows status (color-coded)
- Clicking bill opens bill detail or payment modal

---

## 6. Payment Adjustments

### 6.1 Skipping a Payment
- User can skip a scheduled payment
- Options:
  - **Add to Next Payment**: Next payment becomes double
  - **Add to End**: One extra payment added at end
  - **Spread Across Remaining**: Amount divided across remaining payments
- System updates remaining bills accordingly

### 6.2 Postponing a Payment
- User can postpone a payment date
- New date must be between start and end date
- System updates bill due date
- May affect interest calculations

### 6.3 Extra Payment
- User can pay more than required
- Options:
  - **Reduce Monthly Payment**: Keep same end date, lower payments
  - **Reduce Loan Term**: Keep same payment, finish earlier
  - **Skip Next Few Payments**: Pre-pay for future months
  - **Just Reduce Principal**: Everything stays same, less debt
- System recalculates remaining bills

### 6.4 Partial Payment
- User can pay less than required
- Options:
  - **Add to Next Payment**: Remaining added to next bill
  - **Add to End**: Remaining added to final payment
  - **Spread Across Remaining**: Remaining divided across all remaining bills
- System tracks partial payments
- Updates bill status accordingly

---

## 7. Interest Calculations

### 7.1 Reducing Balance Method
- Interest calculated on remaining balance
- Monthly interest = (Annual Rate / 12 / 100) × Remaining Balance
- Principal = Payment Amount - Interest
- Remaining balance decreases each month
- Interest decreases each month (as balance decreases)
- Principal increases each month (as interest decreases)

### 7.2 Credit Card Interest
- Compounds monthly
- Interest charged on outstanding balance
- Minimum payment: Usually 5% of balance
- If only minimum paid: Balance barely decreases
- If full paid: No interest next month

### 7.3 Automatic Interest Updates
- System automatically calculates interest for each payment
- Updates principal/interest breakdown
- Adjusts remaining balance
- Updates total interest paid
- Updates liability calculations cache

---

## 8. Account Breakdown

### 8.1 Fund Display
- When user selects an account, shows fund breakdown:
  - **Personal Fund**: Available balance
  - **Liability Funds**: List of liability funds (if any)
    - Shows liability name
    - Shows amount
    - Shows which liability it's linked to
  - **Goal Funds**: List of goal funds (if any)
    - Shows goal name
    - Shows amount
    - Shows which goal it's linked to

### 8.2 Fund Selection
- When paying/transferring, user selects:
  1. Account
  2. Fund type (Personal, Liability, Goal)
  3. Specific fund (if Liability or Goal)
- System validates:
  - Fund exists
  - Fund has sufficient balance
  - Fund can be used for the transaction

---

## 9. Database Schema

### 9.1 Account Funds
- `account_funds` table stores all fund types
- `type` field: `personal`, `goal`, `borrowed` (liability)
- `linked_liability_id`: Links liability funds to liabilities
- `balance`: Fund balance
- `spendable`: Whether fund can be spent

### 9.2 Account Liability Portions
- `account_liability_portions` table tracks liability funds
- Links account to liability
- Stores amount allocated to liability
- Used when paying from liability funds
- Updated when payments made or funds converted

### 9.3 Liability Schedules
- `liability_schedules` table stores payment bills
- One record per payment
- Stores due date, amount, status
- Can store principal/interest breakdown in metadata
- Linked to liability via `liability_id`

---

## 10. UI/UX Requirements

### 10.1 Design System
- White background (#FFFFFF)
- Black text (#000000)
- Glass cards (iOS 26 style)
- Typography:
  - Page headings: Helvetica Neue Bold (32px)
  - Section titles: Poppins SemiBold (18-20px)
  - Body text: Instrument Serif Regular (14-16px)
  - Labels: Instrument Serif Regular (12-13px)

### 10.2 Payment Modal
- Glass card design
- Account selection (list of accounts)
- Fund selection (Personal or Liability)
- Amount input
- Date picker
- Description input
- Payment breakdown preview
- Submit button

### 10.3 Transfer Modal
- Glass card design
- Transfer type selection
- Source account selection
- Source fund selection (Liability)
- Destination account selection (same account)
- Destination fund selection (Personal)
- Amount input
- Notes input
- Submit button

### 10.4 Bill Management
- Bills list (in liability detail screen)
- Bill editing (inline or modal)
- Bill status indicators
- Calendar integration
- Payment history

---

## 11. Implementation Checklist

### 11.1 Payment Flow
- [ ] Update pay liability modal with glass card design
- [ ] Implement fund selection (Personal vs Liability)
- [ ] Show payment breakdown (Principal vs Interest)
- [ ] Validate fund availability
- [ ] Process payment from correct fund
- [ ] Update liability balance
- [ ] Update account balance
- [ ] Create transaction record
- [ ] Update payment history

### 11.2 Fund Conversion
- [ ] Update transfer modal to support liability to personal
- [ ] Implement fund selection in transfer modal
- [ ] Validate conversion (same account, different fund types)
- [ ] Process conversion
- [ ] Update account breakdown
- [ ] Create transaction record (if needed)

### 11.3 Bill Management
- [ ] Make bills editable
- [ ] Validate bill edits (date range, amount)
- [ ] Update bill status
- [ ] Link bills to calendar
- [ ] Show bills on transactions page
- [ ] Allow manual bill creation
- [ ] Allow bill deletion (with confirmation)

### 11.4 Interest Calculations
- [ ] Implement reducing balance method
- [ ] Calculate principal/interest for each payment
- [ ] Update calculations when payments made
- [ ] Update calculations when bills edited
- [ ] Cache calculations for performance
- [ ] Support variable interest rates

### 11.5 Account Breakdown
- [ ] Show fund breakdown in account detail
- [ ] Show liability funds with liability names
- [ ] Show goal funds with goal names
- [ ] Show personal fund balance
- [ ] Update breakdown after transactions
- [ ] Show fund availability

---

## 12. Testing Scenarios

### 12.1 Payment Scenarios
1. Pay from personal funds
2. Pay from liability funds
3. Pay more than required
4. Pay less than required (partial payment)
5. Pay with insufficient funds
6. Pay from wrong liability fund (should fail)

### 12.2 Fund Conversion Scenarios
1. Convert liability fund to personal fund
2. Convert partial liability fund
3. Convert when liability fund has insufficient balance
4. Convert from wrong account (should fail)
5. Convert to wrong fund type (should fail)

### 12.3 Bill Management Scenarios
1. Edit bill due date
2. Edit bill amount
3. Mark bill as paid
4. Skip bill
5. Postpone bill
6. Delete bill
7. Create manual bill

### 12.4 Interest Calculation Scenarios
1. Calculate interest for reducing balance loan
2. Calculate interest for credit card
3. Update interest when payment made
4. Update interest when bill edited
5. Handle variable interest rates
6. Handle zero interest (EMI)

---

## 13. Edge Cases

### 13.1 Insufficient Funds
- User tries to pay more than available
- System shows error message
- System suggests using different fund or account
- System shows available balance

### 13.2 Multiple Liability Funds
- User has multiple liability funds in same account
- System shows all liability funds
- User selects correct liability fund
- System validates fund is for correct liability

### 13.3 Bill Overlap
- User edits bill date to overlap with another bill
- System validates date range
- System shows error if overlap
- System suggests alternative date

### 13.4 Interest Rate Changes
- User changes interest rate
- System recalculates all remaining bills
- System updates principal/interest breakdown
- System shows impact analysis

---

## 14. Future Enhancements

### 14.1 Advanced Features
- Auto-pay bills
- Payment reminders
- Debt snowball calculator
- Refinance calculator
- Early payoff calculator
- Interest savings calculator

### 14.2 Reporting
- Total interest paid report
- Payment history report
- Liability summary report
- Fund allocation report
- Tax-deductible interest report

### 14.3 Integration
- Bank account integration
- Credit card integration
- Bill payment services
- Credit score tracking
- Debt consolidation tools

---

Last Updated: 2025-01-27

