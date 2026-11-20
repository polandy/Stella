#!/usr/bin/env bash
set -euo pipefail

# Find the repo root
cd "$(dirname "$0")/.."

# Check if needed directories exist
if [[ ! -d "docs/dev/features" ]] || [[ ! -d "e2e" ]]; then
    echo "Error: docs/dev/features or e2e directory not found." >&2
    exit 1
fi

# use perl to do the heavy lifting
perl -e '
use strict;
use warnings;

my @subsections;
my @cited_parts;

# 1. Parse feature files for subsections
my @feature_files = glob("docs/dev/features/*.md");
for my $file (@feature_files) {
    open my $fh, "<:encoding(UTF-8)", $file or die "Could not open $file: $!";
    while (my $line = <$fh>) {
        # Match headings: ## 2.26 Title, ### 2.26.1 Subtitle, #### 2.26.1.1 Sub-subtitle
        # Use ^#+ to catch any level of heading
        if ($line =~ /^#+\s+([\d.]+)\s+(.*)$/) {
            my $num = $1;
            my $title = $2;
            $title =~ s/\*\*[^*]*\*\*//g; # remove bold markdown
            $title =~ s/\[unit\]//g;    # remove [unit] tag
            $title =~ s/\s+$//;         # trim trailing whitespace
            $title =~ s/^\s+|\s+$//g;   # trim leading/trailing whitespace
            
            my $is_unit = ($line =~ /\[unit\]/) ? 1 : 0;
            
            my @num_parts = split(/\./, $num);
            push @subsections, {
                num_str => $num,
                num_parts => \@num_parts,
                title => $title,
                is_unit => $is_unit
            };
        }
    }
    close $fh;
}

# 2. Parse e2e spec files for citations in headers
my @spec_files = glob("e2e/*.spec.ts");
for my $file (@spec_files) {
    open my $fh, "<:encoding(UTF-8)", $file or die "Could not open $file: $!";
    my $header_content = "";
    my $in_header = 0;
    
    while (my $line = <$fh>) {
        # The header is the first /* ... */ block.
        # It usually comes after the imports (line 5 to 8), its lines start with " * ", and it closes with an indented " */".
        if (!$in_header && $line =~ /^\/\*/) {
            $in_header = 1;
        }
        if ($in_header) {
            $header_content .= $line;
            if ($line =~ /^\s+\*\/\s*$/) {
                $in_header = 0;
                last;
            }
        }
    }
    close $fh;

    # Extract citations from header_content
    # Section symbol is \x{00A7}
    # En-dash is \x{2013}

    # Handle ranges first: §2.26.6–7
    while ($header_content =~ /\x{00A7}([\d.]+)\x{2013}([\d.]+)/g) {
        my $base_num = $1;
        my $range_num = $2;
        my @base_parts = split(/\./, $base_num);
        my @range_parts = split(/\./, $range_num);
        
        if (scalar @range_parts == 1) {
            # It is a range like 2.26.6–7. We want 2.26.6 and 2.26.7
            my @p1 = @base_parts;
            push @cited_parts, \@p1;
            
            my @p2 = @base_parts;
            $p2[-1] = $range_parts[0];
            push @cited_parts, \@p2;
        } else {
            # It is a full range like 2.26.6–2.26.10
            push @cited_parts, \@base_parts;
            push @cited_parts, \@range_parts;
        }
    }

    # Handle regular citations: §2.26 or §2.26.1
    # We use a lookbehind/lookahead or just match all and filter.
    while ($header_content =~ /\x{00A7}([\d.]+)/g) {
        my $num = $1;
        my @parts = split(/\./, $num);
        if (@parts && $parts[0] eq "2") {
            push @cited_parts, \@parts;
        }
    }
}

# 3. Compare
my @uncovered;
for my $sub (@subsections) {
    my $covered = 0;
    if ($sub->{is_unit}) {
        $covered = 1;
    } else {
        for my $cit (@cited_parts) {
            # Check if cit is a prefix of sub->num_parts
            if (scalar @$cit <= scalar @{$sub->{num_parts}}) {
                my $match = 1;
                for my $i (0 .. $#$cit) {
                    if ($cit->[$i] != $sub->{num_parts}->[$i]) {
                        $match = 0;
                        last;
                    }
                }
                if ($match) {
                    $covered = 1;
                    last;
                }
            }
        }
    }
    
    if (!$covered) {
        push @uncovered, $sub;
    }
}

# 4. Sort and Print
# Sort by number (natural sort)
for my $i (0 .. $#uncovered) {
    for my $j ($i + 1 .. $#uncovered) {
        my $cmp = 0;
        my $len = scalar(@{$uncovered[$i]->{num_parts}} < scalar(@{$uncovered[$j]->{num_parts}}) ? scalar(@{$uncovered[$i]->{num_parts}}) : scalar(@{$uncovered[$j]->{num_parts}}));
        for my $k (0 .. $len - 1) {
            if ($uncovered[$i]->{num_parts}->[$k] < $uncovered[$j]->{num_parts}->[$k]) {
                $cmp = -1; last;
            } elsif ($uncovered[$i]->{num_parts}->[$k] > $uncovered[$j]->{num_parts}->[$k]) {
                $cmp = 1; last;
            }
        }
        if ($cmp == 0 && scalar(@{$uncovered[$i]->{num_parts}}) < scalar(@{$uncovered[$j]->{num_parts}})) {
            $cmp = -1;
        } elsif ($cmp == 0 && scalar(@{$uncovered[$i]->{num_parts}}) > scalar(@{$uncovered[$j]->{num_parts}})) {
            $cmp = 1;
        }

        if ($cmp > 0) {
            my $tmp = $uncovered[$i];
            $uncovered[$i] = $uncovered[$j];
            $uncovered[$j] = $tmp;
        }
    }
}

foreach my $sub (@uncovered) {
    printf "%s %s\n", $sub->{num_str}, $sub->{title};
}
'
