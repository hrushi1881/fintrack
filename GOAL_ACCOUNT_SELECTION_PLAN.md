# Goal Account Selection and Visualization Plan

## Problem Statement
Currently, all goal funds are stored in a single hardcoded "Goals Savings" account, and users cannot:
- See which accounts hold their goal money
- Select which account to store goal funds in when contributing
- Understand where their goal money is actually saved

## New Requirements

### 1. Goal Fund Storage
- Goal funds can be stored in ANY user account (not just Goals Savings)
- Each goal can have funds in multiple accounts
- Funds are stored as goal-type fund buckets within accounts
- Goals Savings account shows aggregate numbers of all goals only

### 2. Contribution Flow
- User selects source account (where money comes from)
- User selects destination account (where goal money will be stored)
- Money moves from source account personal funds to destination account goal fund bucket
- Account selection uses circular button UI with account icons

### 3. Goal Detail Screen
- Shows all accounts that hold money for this goal
- Displays account name, balance, and breakdown
- Shows total goal progress
- Lists contributions and withdrawals

### 4. Withdrawal Flow
- User selects source fund (which goal fund in which account)
- User selects destination account (where money goes)
- Money moves from goal fund to personal funds in destination account
- Uses "From" and "To" card-based selection UI

### 5. Goals Savings Account
- Shows aggregate numbers: total goal funds, number of goals, etc.
- On detail page, shows list of all goals and their accounts
- Does not store individual goal funds (goals use regular accounts)

## UI/UX Requirements

### Account Selection
- Circular buttons with account icons (like image provided)
- Selected state: dark olive green background, white icon/text
- Unselected state: light gray background, dark gray icon/text
- Shows account name and type
- Horizontal scrollable list

### From/To Cards
- Card-based selection with account name and balance
- Circular icon with directional arrow (up for From, down for To)
- Dropdown chevron indicator for selection
- Clean, minimalist design
- Light olive green accents

### Amount Input
- Large, centered amount field
- Currency symbol on left
- Placeholder "0.00"
- Clean, focused design

## Implementation Steps

### Phase 1: Database and Backend Changes

1. **Remove dependency on Goals Savings account for individual goals**
   - Goals no longer require a single account
   - Account_funds table already supports goal funds in any account via linked_goal_id
   - Update RPC functions to work with any account

2. **Update Goals Savings account concept**
   - Keep account but use it only for aggregation/display
   - Remove requirement to create it for each goal
   - Use it to show goal overview

### Phase 2: Contribution Flow Updates

1. **Update add-contribution.tsx modal**
   - Add destination account selection (where goal money will be stored)
   - Use circular button UI for account selection
   - Update RPC call to use selected destination account
   - Show "From" and "To" cards with account details

2. **Update goals.ts utilities**
   - Remove getOrCreateGoalsSavingsAccount requirement
   - Update addContributionToGoal() to accept destination_account_id
   - Use destination account for goal fund storage
   - Update transaction flow

### Phase 3: Goal Detail Screen Updates

1. **Add account breakdown section**
   - Query account_funds to find all accounts with this goal's funds
   - Display account cards showing:
     - Account name and type
     - Account balance
     - Goal fund balance within account
     - Link to account detail
   - Update "Linked Accounts" tab to show actual accounts

2. **Update goal detail display**
   - Show total progress
   - Show breakdown by account
   - Update contributions list to show source and destination accounts

### Phase 4: Withdrawal Flow Updates

1. **Update withdraw funds modal**
   - Add fund selection (which goal fund in which account)
   - Add destination account selection (where money goes)
   - Use "From" and "To" card UI
   - Update withdrawal logic to use selected accounts

2. **Update goals.ts utilities**
   - Update withdrawFromGoal() to accept source account and destination account
   - Handle fund bucket selection
   - Move money to personal funds in destination account

### Phase 5: Goals Savings Account Updates

1. **Update Goals Savings account display**
   - Show aggregate goal statistics
   - List all goals with their accounts
   - Show total goal funds across all accounts
   - Remove individual goal fund storage logic

### Phase 6: UI Component Updates

1. **Create AccountSelector component**
   - Circular button selection UI
   - Account icons and names
   - Selected/unselected states
   - Horizontal scrollable

2. **Create FromToAccountCards component**
   - "From" card with account details
   - "To" card with account details
   - Dropdown selection indicator
   - Account balance display
   - Directional arrow icons

3. **Update amount input**
   - Large, centered design
   - Currency symbol
   - Clean placeholder

## Database Changes

### No Schema Changes Needed
- Account_funds table already supports goal funds in any account
- Linked_goal_id already tracks which goal the fund belongs to
- Account_id already tracks which account holds the fund

### Migration Needed
- Update existing goals to work with new system
- Migrate funds from Goals Savings to user-selected accounts (or keep in Goals Savings for existing goals)
- Update any hardcoded references to Goals Savings account

## Files to Modify

1. `fintrack/app/modals/add-contribution.tsx` - Add destination account selection
2. `fintrack/app/modals/withdraw-funds.tsx` - Add fund and account selection
3. `fintrack/app/goal/[id].tsx` - Show account breakdown
4. `fintrack/utils/goals.ts` - Update contribution/withdrawal logic
5. `fintrack/components/AccountSelector.tsx` - New component for account selection
6. `fintrack/components/FromToAccountCards.tsx` - New component for From/To selection
7. `fintrack/app/account/[id].tsx` - Update Goals Savings account display (if needed)

## Testing Considerations

- Test contribution with different account selections
- Test withdrawal with fund and account selection
- Test goal detail screen account breakdown
- Test Goals Savings account aggregation
- Test existing goals migration
- Test edge cases (account deleted, insufficient funds, etc.)

