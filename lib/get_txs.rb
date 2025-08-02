require 'date'
require_relative 'whats_on_chain.rb'

# Get the Address balance from Whats on Chain
w = WhatsOnChain.new
response = w.get_address_balance("13ycKt5iTceSbmZ1GGJgvKsoGaJPv2pVgZ")

# Loop the results and save to /_data/txs.json
txs = response["result"]
txs = txs.filter { |tx| tx["status"] == "confirmed" }
txs = txs.sort_by { |tx| tx["height"] }

## Loop each TX and get its full contents
# txs.each do |tx|
#   response = w.get_tx(tx["tx_hash"])
#   hash = JSON.parse(response.to_s)

#   puts "Saving #{tx["tx_hash"]} ..."
#   File.open("_data/txs/#{tx["tx_hash"]}.json", "w") do |f|
#     f << JSON.pretty_generate(hash)
#   end
#   sleep 1.618
# end

json_path = "_data/txs/index.json"
new_data = JSON.pretty_generate(txs)

# 2. CREATE A BRANCH IF THERE ARE CHANGES ======================================

# Read existing file if present
existing_data = File.exist?(json_path) ? File.read(json_path) : ""

# Check if data has changed
if new_data == existing_data
  puts "✅ No changes detected. Exiting..."
  exit 0
end

# Write new data to file
File.write(json_path, new_data)
puts "Saved #{txs.size} transactions to #{json_path}"

# Generate branch name
date = Date.today.strftime("%Y-%m-%d")
branch_name = "update-transactions-#{date}"

# Set up Git
# `git config --global user.email "github-actions@github.com"`
# `git config --global user.name "GitHub Actions"`

# Create new branch
`git checkout -b #{branch_name}`

# Commit the new data files
`git add _data/txs/*`
`git commit -m "Update transactions data from WhatsOnChain on #{date}"`

# Push the branch to remote
`git push origin #{branch_name}`

puts "Pushed changes to branch #{branch_name}"