#!/usr/bin/env bash
# Report-only: list each feature subsection (docs/dev/features/*.md) that no e2e header cites and
# that is not marked unit. Exits 0 whatever it finds; non-zero only when a file cannot be read.
#
# A heading that unit tests cover instead of an e2e spec ends in `[unit]` (docs/dev/08 §8.5).
# Only the header comment of a spec counts, and a citation covers its subsections too: `§2.26`
# covers 2.26.1. Ranges such as `§2.26.6–7` stand for both ends.
#
#   ./scripts/spec-coverage.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d docs/dev/features || ! -d e2e ]]; then
  echo "docs/dev/features or e2e not found" >&2
  exit 1
fi

# Perl, so the § and – match as characters whatever the locale (LC_ALL=C included)
perl -e '
use strict;
use warnings;
binmode STDOUT, ":encoding(UTF-8)";

my @subsections;
my @cited_parts;

# 1. Parse feature files for subsections
my @feature_files = glob("docs/dev/features/*.md");
for my $file (@feature_files) {
  open my $fh, "<:encoding(UTF-8)", $file or die "Could not open $file: $!";
  while (my $line = <$fh>) {
    # ## 2.26 Title, ### 2.26.1 Subtitle, #### 2.26.1.1 Sub-subtitle
    if ($line =~ /^#+\s+([\d.]+)\s+(.*)$/) {
      my $num = $1;
      my $title = $2;
      $title =~ s/\*\*[^*]*\*\*//g; # remove bold markdown
      $title =~ s/\[unit\]//g;    # remove [unit] tag
      $title =~ s/^\s+|\s+$//g;

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

  # The header is the first /* ... */ block; it closes with an indented " */".
  while (my $line = <$fh>) {
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

  # Ranges: §2.26.6–7
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

# 4. Sort by section number (2.2 before 2.10) and print
sub by_number {
  my @x = @{$a->{num_parts}};
  my @y = @{$b->{num_parts}};
  while (@x && @y) {
    my $c = shift(@x) <=> shift(@y);
    return $c if $c;
  }
  return @x <=> @y;
}
@uncovered = sort by_number @uncovered;

foreach my $sub (@uncovered) {
  printf "%s %s\n", $sub->{num_str}, $sub->{title};
}
'
