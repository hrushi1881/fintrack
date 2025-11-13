# Liability System - Complete Implementation Guide

## Overview
This document provides a complete explanation of the liability system, including different types of loans, fund management, payment flow, and implementation details.

---

## 1. Different Types of Loans

### 1.1 Loan
- **Type**: `loan` (mapped to `personal_loan` in DB)
- **Description**: Personal, Student, Auto, Mortgage loans
- **Characteristics**:
  - Fixed monthly payment
  - Fixed interest rate (or variable)
  - Fixed term (or adjustable)
  - Principal and interest breakdown
  - Reducing balance method

### 1.2 Credit Card
- **Type**: `credit_card`
- **Description**: Credit card debt
- **Characteristics**:
  - Variable payment (minimum or full)
  - High interest rate (typically 36% annual)
  - Compounding interest
  - Minimum payment option
  - Balance can increase if only minimum paid

### 1.3 EMI Purchase
- **Type**: `emi` (mapped to `personal_loan` in DB with EMI metadata)
- **Description**: Fixed monthly installments for purchases
- **Characteristics**:
  - Fixed monthly payment
  - Can be zero-interest (no-cost EMI)
  - Fixed term (typically 6-24 months)
  - Principal only (if zero-interest)
  - Principal and interest (if interest-bearing)

### 1.4 Line of Credit
- **Type**: `line_of_credit` (mapped to `one_time` in DB)
- **Description**: Overdraft, credit line, flexible borrowing
- **Characteristics**:
  - Variable usage
  - Interest charged only on amount used
  - No fixed repayment schedule
  - Flexible withdrawal and repayment
  - Credit limit

### 1.5 Other
- **Type**: `other` (mapped to `one_time` in DB)
- **Description**: Other types of debt
- **Characteristics**:
  - Custom configuration
  - Flexible payment terms
  - Variable amounts
  - Custom interest rates

---

## 2. Fund Management System

### 2.1 Personal Fund (Mandatory)
- **Type**: `personal`
- **Description**: User's own money, available for spending
- **Availability**: Every account has one personal fund
- **Usage**: Can be used for any transaction
- **Creation**: Created automatically when account is created
- **Balance**: Total account balance minus liability and goal funds

### 2.2 Liability Fund (Optional)
- **Type**: `liability` (stored as `borrowed` in `account_funds` table)
- **Description**: Money reserved for liability payments
- **Availability**: Created when user receives money from a liability
- **Usage**: Can only be used to pay the specific liability it's linked to
- **Tracking**: Tracked in `account_liability_portions` table
- **Creation**: Created when user allocates received money to an account

### 2.3 Goal Fund (Optional)
- **Type**: `goal`
- **Description**: Money saved toward specific goals
- **Availability**: Created when user contributes to a goal
- **Usage**: Cannot be spent directly (must withdraw to personal first)
- **Note**: Not relevant for liability payments

---

## 3. Creating a Liability

### 3.1 Basic Flow (5 Questions)
1. **What should we call this?**
   - User enters liability name (e.g., "Car Loan", "Credit Card")
   
2. **What type of liability is this?**
   - Options: Loan, Credit Card, EMI Purchase, Line of Credit, Other
   - User selects type
   
3. **How much do you owe in total?**
   - User enters total amount owed
   - System uses this to calculate payment schedule
   
4. **What's your monthly payment?**
   - User enters monthly payment amount
   - System calculates:
     - Number of payments
     - Approximate interest rate
     - Final payment date
   
5. **When is your first payment due?**
   - User selects first payment date
   - System uses this to generate payment schedule

### 3.2 Optional: Did You Receive Money?
- **Question**: "Did you receive money when you took this loan?"
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

### 3.3 Automatic Bill Generation
- System automatically generates all payment bills
- Bills stored in `liability_schedules` table
- Each bill has:
  - Due date (monthly from start date)
  - Amount (monthly payment, adjusted for last payment)
  - Principal component (calculated)
  - Interest component (calculated)
  - Status (pending by default)

---

## 4. Paying a Liability

### 4.1 Payment Flow
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

### 4.2 Fund Selection Rules
- **Personal Funds**: Can always be used
- **Liability Funds**: Can only be used if:
  - Liability fund exists in selected account
  - Liability fund is linked to the same liability being paid
  - Liability fund has sufficient balance
- **Goal Funds**: Cannot be used for liability payments

### 4.3 Payment Processing
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

### 4.4 Payment Breakdown
- Shows principal vs interest for each payment
- Principal: Reduces the actual debt
- Interest: Cost of borrowing
- Breakdown calculated based on:
  - Current balance
  - Interest rate
  - Payment amount
  - Remaining term

---

## 5. Converting Liability Funds to Personal Funds

### 5.1 Transfer Flow
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

### 5.2 Conversion Process
- Uses `convertLiabilityToPersonal` function
- Reduces `account_liability_portions` amount
- Increases personal fund balance
- Account total balance remains the same
- Creates transaction record (if needed)
- Updates account breakdown

### 5.3 Use Cases
- User wants to use liability money for personal expenses
- User over-allocated to liability fund
- User wants to free up money for other purposes
- User wants to reduce liability fund allocation

---

## 6. Bill Management

### 6.1 Automatic Bill Generation
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

### 6.2 Bill Editing
- Users can edit bills after creation
- Editable fields:
  - Due date (must be between start and end date)
  - Amount (can be adjusted)
  - Status (pending, completed, cancelled, overdue)
- Restrictions:
  - Due date must be between liability start and end date
  - Amount must be positive
  - Cannot edit completed bills (or allow with confirmation)

### 6.3 Bill Status
- **Pending**: Scheduled, not yet paid
- **Completed**: Paid
- **Cancelled**: Cancelled by user
- **Overdue**: Past due date, not paid

### 6.4 Bill Calendar Integration
- Bills appear on calendar in transactions page
- Shows due date
- Shows amount
- Shows liability name
- Shows status (color-coded)
- Clicking bill opens bill detail or payment modal

---

## 7. Payment Adjustments

### 7.1 Skipping a Payment
- User can skip a scheduled payment
- Options:
  - **Add to Next Payment**: Next payment becomes double
  - **Add to End**: One extra payment added at end
  - **Spread Across Remaining**: Amount divided across remaining payments
- System updates remaining bills accordingly

### 7.2 Postponing a Payment
- User can postpone a payment date
- New date must be between start and end date
- System updates bill due date
- May affect interest calculations

### 7.3 Extra Payment
- User can pay more than required
- Options:
  - **Reduce Monthly Payment**: Keep same end date, lower payments
  - **Reduce Loan Term**: Keep same payment, finish earlier
  - **Skip Next Few Payments**: Pre-pay for future months
  - **Just Reduce Principal**: Everything stays same, less debt
- System recalculates remaining bills

### 7.4 Partial Payment
- User can pay less than required
- Options:
  - **Add to Next Payment**: Remaining added to next bill
  - **Add to End**: Remaining added to final payment
  - **Spread Across Remaining**: Remaining divided across all remaining bills
- System tracks partial payments
- Updates bill status accordingly

---

## 8. Interest Calculations

### 8.1 Reducing Balance Method
- Interest calculated on remaining balance
- Monthly interest = (Annual Rate / 12 / 100) × Remaining Balance
- Principal = Payment Amount - Interest
- Remaining balance decreases each month
- Interest decreases each month (as balance decreases)
- Principal increases each month (as interest decreases)

### 8.2 Credit Card Interest
- Compounds monthly
- Interest charged on outstanding balance
- Minimum payment: Usually 5% of balance
- If only minimum paid: Balance barely decreases
- If full paid: No interest next month

### 8.3 Automatic Interest Updates
- System automatically calculates interest for each payment
- Updates principal/interest breakdown
- Adjusts remaining balance
- Updates total interest paid
- Updates liability calculations cache

---

## 9. Account Breakdown

### 9.1 Fund Display
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

### 9.2 Fund Selection
- When paying/transferring, user selects:
  1. Account
  2. Fund type (Personal, Liability, Goal)
  3. Specific fund (if Liability or Goal)
- System validates:
  - Fund exists
  - Fund has sufficient balance
  - Fund can be used for the transaction

---

## 10. Database Schema

### 10.1 Account Funds
- `account_funds` table stores all fund types
- `type` field: `personal`, `goal`, `borrowed` (liability)
- `linked_liability_id`: Links liability funds to liabilities
- `balance`: Fund balance
- `spendable`: Whether fund can be spent

### 10.2 Account Liability Portions
- `account_liability_portions` table tracks liability funds
- Links account to liability
- Stores amount allocated to liability
- Used when paying from liability funds
- Updated when payments made or funds converted

### 10.3 Liability Schedules
- `liability_schedules` table stores payment bills
- One record per payment
- Stores due date, amount, status
- Can store principal/interest breakdown in metadata
- Linked to liability via `liability_id`

---

## 11. Implementation Status

### 11.1 Completed
- ✅ Add liability modal with 5-question flow
- ✅ Automatic bill generation
- ✅ Fund allocation (received money)
- ✅ Payment modal with fund selection
- ✅ Fund picker component
- ✅ Liability to personal fund conversion (basic)

### 11.2 In Progress
- 🚧 Payment modal redesign (glass cards)
- 🚧 Payment breakdown (principal vs interest)
- 🚧 Bill editing
- 🚧 Bill calendar integration

### 11.3 Pending
- ⏳ Payment adjustments (skip, postpone, extra payment)
- ⏳ Interest calculations (improved)
- ⏳ Bill validation (date range, amount)
- ⏳ Transfer modal redesign (glass cards)
- ⏳ Account breakdown display
- ⏳ Fund availability display

---

## 12. Next Steps

### 12.1 Immediate
1. Update pay liability modal with glass card design
2. Add payment breakdown (principal vs interest) preview
3. Make bills editable
4. Link bills to calendar

### 12.2 Short-term
1. Implement payment adjustments (skip, postpone, extra payment)
2. Improve interest calculations
3. Add bill validation
4. Update transfer modal with glass card design

### 12.3 Long-term
1. Add payment reminders
2. Add debt snowball calculator
3. Add refinance calculator
4. Add early payoff calculator
5. Add interest savings calculator

---

## 13. Key Points

### 13.1 Fund Types
- **Personal Fund**: Mandatory, user's own money
- **Liability Fund**: Optional, money from liability, can only pay that liability
- **Goal Fund**: Optional, money for goals, cannot be spent directly

### 13.2 Payment Flow
- User selects account
- User selects fund type (Personal or Liability)
- User enters amount
- System processes payment from correct fund
- System updates liability balance
- System updates account balance

### 13.3 Fund Conversion
- User can convert liability funds to personal funds
- Uses transfer modal
- Selects source account and fund (Liability)
- Selects destination account and fund (Personal, same account)
- System converts funds

### 13.4 Bill Management
- Bills automatically generated when liability created
- Bills can be edited later
- Bills appear on calendar
- Bills can be paid, skipped, postponed, or cancelled

### 13.5 Interest Calculations
- Reducing balance method for loans
- Compounding interest for credit cards
- Principal and interest breakdown for each payment
- Automatic calculation and updates

---

Last Updated: 2025-01-27

